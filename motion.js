/* Motion layer: GSAP + Lenis on top of script.js. Without these libraries, or under
   reduced motion, the site runs on script.js alone and nothing here is required. */

(() => {
  const root = document.documentElement;
  const { gsap, ScrollTrigger, SplitText, Lenis } = window;

  if (!gsap || !ScrollTrigger || !SplitText || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.remove("boot");
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText);
  root.classList.add("motion");

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const ease = "expo.out";
  const swap = "power4.inOut";
  const stageClip = "polygon(7.9% 0%, 100% 0%, 92.1% 100%, 0% 100%)";
  const stageClipClosed = "polygon(7.9% 0%, 7.9% 0%, 0% 100%, 0% 100%)";
  const portraitClip = "polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)";
  const portraitClipClosed = "polygon(10% 0%, 10% 0%, 0% 100%, 0% 100%)";

  /* Smooth scroll. Modals, the roster strip, and the demo frame keep native scrolling. */

  let lenis = null;

  if (Lenis) {
    const hudHeight = () => $(".hud")?.offsetHeight || 0;

    lenis = new Lenis({
      lerp: 0.12,
      anchors: { offset: -(hudHeight() + 16) },
      prevent: (node) => Boolean(node.closest?.(".roster, .dossier, .demo-player, .photo-modal")),
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* P1 cursor: one marker that glides between roster tiles. */

  const roster = $("#project-grid");
  const cursor = document.createElement("li");
  cursor.className = "p1-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = "<span>P1</span>";

  if (roster) {
    roster.append(cursor);
    root.classList.add("has-p1");
  }

  const placeCursor = (animate) => {
    const tile = roster && $(".tile.is-current", roster);

    if (!tile) {
      return;
    }

    const item = tile.parentElement;
    const x = item.offsetLeft + item.offsetWidth * 0.88 - cursor.offsetWidth;
    const y = item.offsetTop + item.offsetHeight * 0.09;

    gsap.to(cursor, { x, y, duration: animate ? 0.38 : 0, ease, overwrite: "auto" });
  };

  /* Stage: the name slams in letter by letter on every swap. */

  const stageName = $("#stage-name");
  const stageTagline = $("#stage-tagline");
  const stageStats = $("#stage-stats");

  let nameSplit = null;

  const splitName = () => {
    const text = stageName.textContent;
    nameSplit?.revert();
    stageName.textContent = text;
    nameSplit = SplitText.create(stageName, { type: "words,chars" });
    return nameSplit;
  };

  const stagePainted = () => {
    const split = splitName();
    const booting = boot.progress() < 1;

    gsap.from(split.chars, {
      x: 46,
      skewX: -24,
      autoAlpha: 0,
      duration: 0.42,
      stagger: 0.024,
      delay: booting ? Math.max(0, 0.35 - boot.time()) : 0,
      ease,
    });

    if (booting) {
      return;
    }

    gsap.from(stageTagline, { autoAlpha: 0, x: -14, duration: 0.35, ease });
    gsap.from($$("dd", stageStats), { autoAlpha: 0, y: 8, duration: 0.3, stagger: 0.04, ease });
    placeCursor(true);
  };

  /* Boot: the select screen loads in like a game menu. Never blocks input. */

  const bootSplit = splitName();
  const boot = gsap.timeline({ defaults: { ease } });

  boot
    .from(".hud", { yPercent: -100, duration: 0.5 }, 0)
    .fromTo(".stage-screen", { clipPath: stageClipClosed }, { clipPath: stageClip, duration: 0.7, clearProps: "clipPath" }, 0.1)
    .from(".select-intro > *", { autoAlpha: 0, y: 24, duration: 0.55, stagger: 0.08 }, 0.15)
    .from(bootSplit.chars, { yPercent: 90, skewX: -24, autoAlpha: 0, duration: 0.5, stagger: 0.035 }, 0.35)
    .from($$(".stats > div"), { autoAlpha: 0, x: -24, duration: 0.4, stagger: 0.05 }, 0.45)
    .from(".stage-tagline", { autoAlpha: 0, x: -18, duration: 0.45 }, 0.5)
    .from("#stage-open", { autoAlpha: 0, duration: 0.45 }, 0.58)
    .from(roster ? $$(":scope > li:not(.p1-cursor)", roster) : [], { autoAlpha: 0, y: 36, scale: 0.92, duration: 0.55, stagger: 0.06 }, 0.3)
    .from(".controls-hint", { autoAlpha: 0, duration: 0.4 }, 0.8)
    .add(() => placeCursor(false), 0.85)
    .fromTo(cursor, { autoAlpha: 0, scale: 1.8 }, { autoAlpha: 1, scale: 1, duration: 0.3 }, 0.88);

  root.classList.remove("boot");

  /* Roster tiles lean toward the pointer, like a cursor resting on a fighter. */

  if (finePointer && roster) {
    $$(".tile", roster).forEach((tile) => {
      const tiltX = gsap.quickTo(tile, "rotationX", { duration: 0.4, ease: "power3.out" });
      const tiltY = gsap.quickTo(tile, "rotationY", { duration: 0.4, ease: "power3.out" });
      gsap.set(tile, { transformPerspective: 700 });

      tile.addEventListener("pointermove", (event) => {
        const box = tile.getBoundingClientRect();
        tiltY(((event.clientX - box.left) / box.width - 0.5) * 12);
        tiltX(-((event.clientY - box.top) / box.height - 0.5) * 10);
      });

      tile.addEventListener("pointerleave", () => {
        tiltX(0);
        tiltY(0);
      });
    });
  }

  /* Wipe: a red slab carries the game's name across, and the dossier opens behind it. */

  const wipeEl = $("#wipe");
  const slab = $(".wipe-slab", wipeEl);
  const wipeName = $("#wipe-name");
  let wipeTimeline = null;

  gsap.set(wipeEl, { autoAlpha: 0 });
  gsap.set(slab, { xPercent: -130 });

  const wipe = (project, reveal) => {
    wipeTimeline?.progress(1);
    wipeName.textContent = project.name || project.title;

    wipeTimeline = gsap
      .timeline({ onComplete: () => gsap.set(wipeEl, { autoAlpha: 0 }) })
      .set(wipeEl, { autoAlpha: 1 })
      .fromTo(slab, { xPercent: -130 }, { xPercent: 0, duration: 0.3, ease: swap })
      .fromTo(wipeName, { x: 120, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.3, ease }, 0.14)
      .call(reveal, null, 0.5)
      .to(wipeName, { x: -120, autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0.52)
      .to(slab, { xPercent: 130, duration: 0.3, ease: swap }, 0.56);
  };

  /* Game sheet: key art and details settle in when a DiJoker game is picked. */

  const gameOpened = (sheet) => {
    gsap.fromTo($(".demo-art", sheet), { autoAlpha: 0, x: -32 }, { autoAlpha: 1, x: 0, duration: 0.45, ease, clearProps: "transform" });
    gsap.fromTo(
      $$(".demo-info > *", sheet),
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.04, ease, clearProps: "transform" }
    );
  };

  /* Sections: each one arrives its own way, once. */

  $$(".section-title, .continue-title").forEach((title) => {
    const split = SplitText.create(title, { type: "words,chars" });

    gsap.from(split.chars, {
      yPercent: 70,
      skewX: -20,
      autoAlpha: 0,
      duration: 0.5,
      stagger: 0.03,
      ease,
      scrollTrigger: { trigger: title, start: "top 85%", once: true },
    });
  });

  gsap.fromTo(
    ".player-portrait",
    { clipPath: portraitClipClosed },
    {
      clipPath: portraitClip,
      duration: 0.8,
      ease,
      clearProps: "clipPath",
      scrollTrigger: { trigger: ".player", start: "top 70%", once: true },
    }
  );

  gsap.from(".move-list li", {
    autoAlpha: 0,
    x: -48,
    duration: 0.5,
    stagger: 0.07,
    ease,
    scrollTrigger: { trigger: ".move-list", start: "top 80%", once: true },
  });

  gsap.from(".loadout li", {
    autoAlpha: 0,
    y: 12,
    duration: 0.35,
    stagger: 0.025,
    ease,
    scrollTrigger: { trigger: ".loadout", start: "top 90%", once: true },
  });

  gsap.from(".career-list li", {
    autoAlpha: 0,
    xPercent: -6,
    duration: 0.6,
    stagger: 0.12,
    ease,
    scrollTrigger: { trigger: ".career-list", start: "top 78%", once: true },
  });

  /* HUD: the nav lights up for the section on screen. */

  const navTargets = $$(".hud-nav a")
    .map((link) => [link, $(link.getAttribute("href"))])
    .filter(([, section]) => section);

  const lightNav = () => {
    const line = window.innerHeight / 2;
    let current = null;

    navTargets.forEach(([link, section]) => {
      const box = section.getBoundingClientRect();

      if (box.top <= line && box.bottom > line) {
        current = link;
      }
    });

    navTargets.forEach(([link]) => {
      link.classList.toggle("is-active", link === current);

      if (link === current) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  ScrollTrigger.create({ start: 0, end: "max", onUpdate: lightNav, onRefresh: lightNav });

  /* Continue? counts down like an arcade cabinet while it is on screen. */

  const count = $("#continue-count");
  let countValue = 9;
  let countTimer = 0;

  const tick = () => {
    countValue = countValue === 0 ? 9 : countValue - 1;
    count.textContent = String(countValue);
    gsap.fromTo(count, { scale: 1.45, autoAlpha: 0.25 }, { scale: 1, autoAlpha: 1, duration: 0.45, ease });
    countTimer = window.setTimeout(tick, countValue === 0 ? 1800 : 1000);
  };

  if (count) {
    count.hidden = false;

    ScrollTrigger.create({
      trigger: "#contact",
      start: "top 75%",
      end: "bottom top",
      onToggle: ({ isActive }) => {
        window.clearTimeout(countTimer);

        if (isActive) {
          countValue = 10;
          tick();
        }
      },
    });
  }

  window.addEventListener("resize", () => placeCursor(false));
  document.fonts?.ready.then(() => {
    ScrollTrigger.refresh();
    placeCursor(false);
  });

  window.PortfolioMotion = {
    stagePainted,
    wipe,
    gameOpened,
    scrollLock: (locked) => {
      if (!lenis) {
        return;
      }

      if (locked) {
        lenis.stop();
      } else {
        lenis.start();
      }
    },
  };
})();
