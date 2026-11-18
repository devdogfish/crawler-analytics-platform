import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { Box, Button, Dialog, Flex, Portal, Text } from "@chakra-ui/react";
import type { HeyBuddy } from "getbuddy";
import { useSite } from "@/components/site-context";
import { isBoolean, useBrowserState } from "@/lib/browser-state";

const marker = (name: string) => `[data-walkthrough="${name}"]`;
const navigation = (section: string) => [marker(`nav-${section}`), marker("sections")];

function hintFor(section: string, detail: string | undefined, search: URLSearchParams) {
  switch (section) {
    case "analytics":
      return { targets: navigation("crawls"), title: "Open Crawls", text: "See which runs succeeded and what they found." };
    case "crawls":
      if (!detail) return {
        targets: [marker("completed-run"), marker("crawl-row")],
        title: "Open a crawl",
        text: "Inspect its request logs and page results.",
      };
      if (search.get("tab") !== "pages") return {
        targets: [marker("run-pages"), marker("run-crawl")],
        title: "Find the Pages tab",
        text: "In the Crawl stage, each row shows a URL and its HTTP response.",
      };
      return { targets: navigation("pages"), title: "Open Pages in the main navigation", text: "Compare URLs across crawls." };
    case "pages":
      return { targets: navigation("issues"), title: "Open Issues", text: "See which findings affect the most pages." };
    case "issues":
      return {
        targets: [marker("launch"), marker("start")],
        title: "Open New crawl",
        text: "Try a replay and watch the results arrive in real time.",
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
          <Dialog.Backdrop bg="blackAlpha.300" />
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
        <WalkthroughHint {...hint} pointer={pointer} finish={finish} />
      )}
    </StartWalkthrough.Provider>
  );
}

function BuddyAvatar() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let buddy: HeyBuddy | undefined;
    let cancelled = false;

    void import("getbuddy").then(async () => {
      if (cancelled) return;
      buddy = document.createElement("hey-buddy");
      buddy.inert = true;
      Object.assign(buddy.style, { position: "absolute", zIndex: "auto", visibility: "hidden" });
      buddy.configure({ variant: "wink", size: 36, followEnabled: false, shortcut: "Unidentified" });
      container.append(buddy);
      buddy.voiceEnabled = false;

      // Position the package's sprite inside the speech bubble after Lit mounts it.
      await buddy.updateComplete;
      if (cancelled) return;
      const style = document.createElement("style");
      style.textContent = `
        .sprite { transform: none !important; filter: none !important; }
        .pulse { display: none !important; }
      `;
      buddy.shadowRoot?.append(style);
      buddy.style.visibility = "visible";
    }).catch(() => { buddy?.remove(); });

    return () => {
      cancelled = true;
      buddy?.remove();
    };
  }, []);

  return <Box ref={host} aria-hidden="true" position="relative" flexShrink={0} boxSize="9" rounded="full" bg="#e4edff" />;
}

function WalkthroughHint({ title, text, targets, pointer, finish }: {
  title: string;
  text: string;
  targets: string[];
  pointer: React.RefObject<Pointer>;
  finish: () => void;
}) {
  const bubble = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const selectors = targets.join(",");

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
    return () => { delete target.dataset.walkthroughFocus; };
  }, [target]);

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
        outline: 2px solid light-dark(#005daa, #79b8ff) !important;
        outline-offset: 3px;
      }`}</style>
      <Flex ref={bubble} role="status" aria-label="Tour hint" aria-atomic="true" position="fixed" top="0" left="0"
        w="min(18rem, calc(100vw - 20px))" zIndex="tooltip" pointerEvents="none" align="start" gap="3"
        bg="#f8faff" color="#111d34" borderWidth="1px" borderColor="#b9cee9" rounded="l3"
        shadow="0 8px 24px rgb(16 30 56 / 23%)" px="3" py="3">
        <BuddyAvatar />
        <Box>
          <Text fontSize="xs" fontWeight="semibold" color="#315787" lineHeight="short">Buddy</Text>
          <Text fontSize="sm" fontWeight="bold" mt="0.5" lineHeight="short">
            {target?.dataset.walkthrough === "launch" ? "Start crawl" : title}
          </Text>
          <Text fontSize="sm" color="#364764" mt="1" lineHeight="short">{text}</Text>
        </Box>
      </Flex>
      <Button size="xs" variant="outline" bg="bg.panel" position="fixed" bottom="4" right="4" zIndex="overlay" onClick={finish}>
        End tour
      </Button>
    </Portal>
  );
}
