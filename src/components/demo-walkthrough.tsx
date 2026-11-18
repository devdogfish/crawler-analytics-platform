import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { Box, Button, Dialog, Flex, Heading, Portal, Text } from "@chakra-ui/react";
import type { HeyBuddy } from "getbuddy";
import { useSite } from "@/components/site-context";
import { isBoolean, useBrowserState } from "@/lib/browser-state";
import { defaultCrawl } from "@/lib/site-pages";

const TOUR = [
  {
    route: "analytics", anchor: "site",
    title: "Get your bearings",
    body: "Overview summarizes site health and suggested fixes. Use the logo menu to switch between Capital Markets, Investor Services, and their QA sites.",
  },
  {
    route: "crawls", anchor: "history",
    title: "Browse crawl history",
    body: "Filter runs by status or search by crawl ID. Open any row to see what ran, how long it took, and which pages it found.",
  },
  {
    route: "run", anchor: "run-tabs",
    title: "Inspect a crawl",
    body: "Select a pipeline stage, then switch between Logs, Metrics, and Pages to inspect requests, response codes, and URLs.",
  },
  {
    route: "pages", anchor: "pages",
    title: "Compare page snapshots",
    body: "Choose two crawls to find added, changed, or removed URLs. Open a page to inspect its captured HTML and findings.",
  },
  {
    route: "issues", anchor: "issues",
    title: "Find what to fix",
    body: "Open a rule to see its affected pages and recurring patterns. Compare crawls to see which findings appeared or cleared.",
  },
  {
    route: "crawls", anchor: "start",
    title: "Try a crawl yourself",
    body: "Choose New crawl, then Start crawl. Watch saved responses arrive over WebSocket and try pausing or resuming the replay.",
  },
] as const;

const StartWalkthrough = createContext(() => {});
export const useStartWalkthrough = () => useContext(StartWalkthrough);

export function DemoWalkthrough({ children }: { children: ReactNode }) {
  const site = useSite();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [seen, setSeen] = useBrowserState("crawler.demo.walkthrough-seen", false, isBoolean);
  const [index, setIndex] = useState<number | null>(null);
  const step = index === null ? null : TOUR[index];
  const pathFor = (route: (typeof TOUR)[number]["route"]) =>
    route === "run" ? `/${site}/crawls/${defaultCrawl(site).id}` : `/${site}/${route}`;

  const goTo = (next: number) => {
    const path = pathFor(TOUR[next].route);
    if (pathname !== path) navigate(path, { replace: index !== null });
    setIndex(next);
  };
  const start = () => {
    setSeen(true);
    goTo(0);
  };

  // Keep the active stop tied to its route, including during router transitions.
  const active = step !== null && pathname === pathFor(step.route);

  return (
    <StartWalkthrough.Provider value={start}>
      <Box css={{ "& [data-walkthrough-focus]": { outline: "2px solid var(--brand)", outlineOffset: "5px", borderRadius: "4px" } }}>
        {children}
      </Box>
      <Dialog.Root open={!seen} onOpenChange={({ open }) => { if (!open) setSeen(true); }} size="sm" placement="center">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header><Dialog.Title>Take a quick tour?</Dialog.Title></Dialog.Header>
              <Dialog.Body>
                <Dialog.Description>See how to track site health, compare crawls, and watch a crawl replay live.</Dialog.Description>
              </Dialog.Body>
              <Dialog.Footer flexWrap="wrap">
                <Button variant="outline" onClick={() => setSeen(true)}>Explore on my own</Button>
                <Button onClick={start}>Take the tour</Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      {active && step && index !== null && (
        <WalkthroughCard key={index} step={step} index={index} goTo={goTo} close={() => setIndex(null)} />
      )}
    </StartWalkthrough.Provider>
  );
}

function WalkthroughCard({ step, index, goTo, close }: {
  step: (typeof TOUR)[number]; index: number; goTo: (next: number) => void; close: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const progressId = useId();
  const selector = `[data-walkthrough="${step.anchor}"]`;
  const finish = () => {
    close();
    document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  };

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.dataset.walkthroughFocus = "";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let buddy: HeyBuddy | undefined;
    let cancelled = false;
    if (reducedMotion) {
      target.scrollIntoView({ block: "center" });
    } else {
      void import("getbuddy").then(() => {
        if (cancelled || !target.isConnected) return;
        buddy = document.createElement("hey-buddy");
        buddy.setAttribute("aria-hidden", "true");
        buddy.inert = true;
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
        buddy.configure({ accent, variant: "pointer-b", followEnabled: false, dock: "bl", shortcut: "Unidentified" });
        document.body.append(buddy);
        buddy.voiceEnabled = false;
        buddy.highlightElement(selector);
      }).catch(() => {
        if (!cancelled) target.scrollIntoView({ block: "center" });
      });
    }
    return () => {
      cancelled = true;
      buddy?.remove();
      delete target.dataset.walkthroughFocus;
    };
  }, [selector]);

  return (
    <Portal>
      <Box as="aside" aria-labelledby={titleId} onKeyDown={(event) => { if (event.key === "Escape") finish(); }}
        position="fixed" right="4" bottom="4" left={{ base: "4", sm: "auto" }} w={{ sm: "23rem" }}
        maxH="calc(100dvh - 2rem)" overflowY="auto" zIndex="overlay" bg="bg.panel" borderWidth="1px" borderColor="border"
        rounded="l3" shadow="lg" p="4">
        <Text id={progressId} textStyle="xs" color="fg.muted">Demo tour · {index + 1} of {TOUR.length}</Text>
        <Heading ref={title} tabIndex={-1} id={titleId} aria-describedby={progressId} as="h2" size="md" mt="1">{step.title}</Heading>
        <Text textStyle="sm" color="fg.muted" mt="2">{step.body}</Text>
        <Flex mt="4" gap="2" wrap="wrap" justify="space-between">
          <Button size="sm" variant="ghost" onClick={finish}>Exit tour</Button>
          <Flex gap="2">
            {index > 0 && <Button size="sm" variant="outline" onClick={() => goTo(index - 1)}>Back</Button>}
            {index < TOUR.length - 1
              ? <Button size="sm" onClick={() => goTo(index + 1)}>Next</Button>
              : <Button size="sm" onClick={finish}>Finish</Button>}
          </Flex>
        </Flex>
      </Box>
    </Portal>
  );
}
