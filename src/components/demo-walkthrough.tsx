import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { Box, Button, Dialog, Portal } from "@chakra-ui/react";
import type { HeyBuddy } from "getbuddy";
import { useSite } from "@/components/site-context";
import { isBoolean, useBrowserState } from "@/lib/browser-state";

const marker = (name: string) => `[data-walkthrough="${name}"]`;
const navigation = (section: string) => [marker(`nav-${section}`), marker("sections")];

function hintFor(section: string, detail: string | undefined, search: URLSearchParams) {
  switch (section) {
    case "analytics":
      return { targets: navigation("crawls"), text: "Open Crawls to see which runs succeeded and what they found." };
    case "crawls":
      if (!detail) return {
        targets: [marker("completed-run"), marker("crawl-row")],
        text: "Open a crawl to inspect its logs and page results.",
      };
      if (search.get("tab") !== "pages") return {
        targets: [marker("run-pages"), marker("run-crawl")],
        text: "Choose the Crawl stage and open its Pages tab to see each HTTP response.",
      };
      return { targets: navigation("pages"), text: "Open Pages in the site navigation to compare URLs across crawls." };
    case "pages":
      return { targets: navigation("issues"), text: "Open Issues to see which findings affect the most pages." };
    case "issues":
      return {
        targets: [marker("launch"), marker("start")],
        text: "Try New crawl, then Start crawl, to watch a replay stream in real time.",
      };
    default:
      return null;
  }
}

const StartWalkthrough = createContext<(event: MouseEvent<HTMLButtonElement>) => void>(() => {});
export const useStartWalkthrough = () => useContext(StartWalkthrough);

type Pointer = { x: number; y: number } | null;

export function DemoWalkthrough({ children }: { children: ReactNode }) {
  const site = useSite();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [seen, setSeen] = useBrowserState("crawler.demo.walkthrough-seen", false, isBoolean);
  const [active, setActive] = useState(false);
  const pointer = useRef<Pointer>(null);
  const [, , section, detail] = pathname.split("/");
  const params = new URLSearchParams(search);
  const launched = section === "crawls" && !!detail && params.has("started");
  const hint = active && !launched ? hintFor(section, detail, params) : null;
  const finish = () => setActive(false);

  useEffect(() => {
    if (launched) setActive(false);
  }, [launched]);

  const start = (event: MouseEvent<HTMLButtonElement>) => {
    pointer.current = event.detail > 0 && window.matchMedia("(any-pointer: fine)").matches
      ? { x: event.clientX, y: event.clientY } : null;
    setSeen(true);
    setActive(true);
    if (section !== "analytics") navigate(`/${site}/analytics`);
  };

  return (
    <StartWalkthrough.Provider value={start}>
      {children}
      <Dialog.Root open={!seen} onOpenChange={({ open }) => { if (!open) setSeen(true); }} size="sm" placement="center">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header><Dialog.Title>Take a quick tour?</Dialog.Title></Dialog.Header>
              <Dialog.Body>
                <Dialog.Description>Follow hints through the dashboard and try a crawl replay. You can leave anytime.</Dialog.Description>
              </Dialog.Body>
              <Dialog.Footer flexWrap="wrap">
                <Button variant="outline" onClick={() => setSeen(true)}>Explore on my own</Button>
                <Button onClick={start}>Take the tour</Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      {hint && (
        <WalkthroughHint key={hint.text} text={hint.text} selectors={hint.targets.join(",")} pointer={pointer} finish={finish} />
      )}
    </StartWalkthrough.Provider>
  );
}

function WalkthroughHint({ text, selectors, pointer, finish }: {
  text: string;
  selectors: string;
  pointer: React.RefObject<Pointer>;
  finish: () => void;
}) {
  const bubble = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const findTarget = () => {
      // Prefer the first visible selector in priority order, including controls inside menus and dialogs.
      const match = selectors.split(",").flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
        .find((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
      setTarget(match ?? null);
    };
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "inert", "aria-expanded"] });
    window.addEventListener("resize", findTarget);
    findTarget();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", findTarget);
    };
  }, [selectors]);

  useEffect(() => {
    if (!target) return;
    target.dataset.walkthroughFocus = "";
    let buddy: HeyBuddy | undefined;
    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      void import("getbuddy").then(() => {
        if (cancelled || !target.isConnected) return;
        buddy = document.createElement("hey-buddy");
        buddy.inert = true;
        buddy.setAttribute("aria-hidden", "true");
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
        buddy.configure({ accent, followEnabled: false, shortcut: "Unidentified" });
        document.body.append(buddy);
        buddy.voiceEnabled = false;
        // The pinned GetBuddy package uses its sprite and tooltip for tours. This
        // integration uses its spotlight and renders the hint independently.
        const style = document.createElement("style");
        style.textContent = `
          .sprite, .tour-tip, .buddy-bubble { display: none !important; }
          .tour-highlight {
            border: 0;
            box-shadow: 0 0 8px color-mix(in srgb, var(--buddy-accent) 45%, transparent);
            transition: none;
          }
        `;
        buddy.shadowRoot?.append(style);
        buddy.startTour([{ selector: "[data-walkthrough-focus]", body: text }]);
      }).catch(() => { /* The CSS outline also works if the optional package fails to load. */ });
    }
    return () => {
      cancelled = true;
      buddy?.remove();
      delete target.dataset.walkthroughFocus;
    };
  }, [target, text]);

  useLayoutEffect(() => {
    const panel = bubble.current;
    if (!panel) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const rect = target?.getBoundingClientRect();
      const cursor = pointer.current;
      const gap = 16;
      const inset = 10;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const x = cursor?.x ?? rect?.left ?? inset;
      const y = cursor?.y ?? rect?.bottom ?? inset;
      const left = cursor && x + gap + width > viewportWidth - inset ? x - width - gap : x + (cursor ? gap : 0);
      const top = y + gap + height > viewportHeight - inset ? (cursor?.y ?? rect?.top ?? y) - height - gap : y + gap;
      const clamp = (value: number, limit: number) => Math.max(inset, Math.min(value, limit));
      panel.style.transform = `translate3d(${clamp(left, viewportWidth - width - inset)}px, ${clamp(top, viewportHeight - height - inset)}px, 0)`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    const move = (event: PointerEvent) => {
      pointer.current = event.pointerType === "touch" ? null : { x: event.clientX, y: event.clientY };
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        pointer.current = null;
        schedule();
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    if (target) observer.observe(target);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("keydown", key);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [pointer, target]);

  return (
    <Portal>
      <style>{`[data-walkthrough-focus] {
        outline: 2px solid var(--brand) !important;
        outline-offset: 3px;
      }`}</style>
      <Box ref={bubble} role="status" aria-label="Tour hint" position="fixed" top="0" left="0"
        maxW="min(17rem, calc(100vw - 20px))" w="max-content" zIndex="tooltip" pointerEvents="none"
        bg="bg.panel" borderWidth="1px" borderColor="border" rounded="l3" shadow="lg" px="3" py="2" textStyle="sm">
        {text}
      </Box>
      <Button size="xs" variant="outline" bg="bg.panel" position="fixed" bottom="4" right="4" zIndex="overlay" onClick={finish}>
        End tour
      </Button>
    </Portal>
  );
}
