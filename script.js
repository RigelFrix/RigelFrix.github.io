const yearTarget = document.getElementById("current-year");
const root = document.documentElement;
const revealItems = document.querySelectorAll("[data-reveal]");
const siteHeader = document.querySelector(".site-header");
const projectAlbums = window.PROJECT_ALBUMS || [];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

if (!reduceMotion) {
  window.addEventListener("pointermove", (event) => {
    root.style.setProperty("--pointer-x", `${event.clientX}px`);
    root.style.setProperty("--pointer-y", `${event.clientY}px`);
  });
}

if (reduceMotion) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const pendingRevealItems = new Set(revealItems);

  const revealVisibleItems = () => {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    pendingRevealItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const entersViewport = rect.top <= viewportHeight * 0.92;
      const remainsOnScreen = rect.bottom >= viewportHeight * 0.08;

      if (entersViewport && remainsOnScreen) {
        item.classList.add("is-visible");
        pendingRevealItems.delete(item);
        observer.unobserve(item);
      }
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          pendingRevealItems.delete(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.04,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  revealItems.forEach((item) => observer.observe(item));
  revealVisibleItems();

  let revealTicking = false;

  const queueRevealCheck = () => {
    if (revealTicking || !pendingRevealItems.size) {
      return;
    }

    revealTicking = true;
    window.requestAnimationFrame(() => {
      revealVisibleItems();
      revealTicking = false;
    });
  };

  if (window.location.hash) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  window.addEventListener("load", revealVisibleItems, { once: true });
  window.addEventListener("resize", queueRevealCheck, { passive: true });
  window.addEventListener("scroll", queueRevealCheck, { passive: true });
}

if (siteHeader) {
  let headerTicking = false;

  const syncHeaderState = () => {
    const currentScrollY = window.scrollY;
    const nearTop = currentScrollY <= 24;

    siteHeader.classList.toggle("is-scrolled", !nearTop);
    siteHeader.classList.toggle("is-hidden", !nearTop);
    headerTicking = false;
  };

  syncHeaderState();

  window.addEventListener(
    "load",
    () => {
      syncHeaderState();
    },
    { once: true }
  );

  window.addEventListener("pageshow", () => {
    syncHeaderState();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (headerTicking) {
        return;
      }

      headerTicking = true;
      window.requestAnimationFrame(syncHeaderState);
    },
    { passive: true }
  );
}

const getAssetUrl = (src) => encodeURI(src);

const createMediaElement = (item, options = {}) => {
  const {
    fit = "cover",
    controls = false,
    autoplay = false,
    muted = true,
    loop = false,
    playsInline = true,
    preload = "metadata",
    loading = "lazy",
  } = options;

  if (item.type === "synthetic") {
    const synthetic = document.createElement("div");
    synthetic.className = "synthetic-media";

    if (item.kicker) {
      const kicker = document.createElement("span");
      kicker.className = "synthetic-media-kicker";
      kicker.textContent = item.kicker;
      synthetic.append(kicker);
    }

    const copy = document.createElement("div");
    copy.className = "synthetic-media-copy";

    const label = document.createElement("strong");
    label.textContent = item.label || "Interactive Systems";

    const detail = document.createElement("p");
    detail.textContent = item.detail || "Production-ready engineering and gameplay-focused execution";

    copy.append(label, detail);
    synthetic.append(copy);

    const meter = document.createElement("div");
    meter.className = "synthetic-media-meter";

    for (let index = 0; index < 3; index += 1) {
      const line = document.createElement("span");
      meter.append(line);
    }

    synthetic.append(meter);

    if (Array.isArray(item.stats) && item.stats.length) {
      const statList = document.createElement("ul");
      statList.className = "synthetic-media-stats";

      item.stats.forEach((stat) => {
        const chip = document.createElement("li");
        chip.textContent = stat;
        statList.append(chip);
      });

      synthetic.append(statList);
    }

    return synthetic;
  }

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = getAssetUrl(item.src);
    video.controls = controls;
    video.autoplay = autoplay;
    video.muted = muted;
    video.loop = loop;
    video.playsInline = playsInline;
    video.preload = preload;
    video.style.objectFit = fit;

    if (item.poster) {
      video.poster = getAssetUrl(item.poster);
    }

    return video;
  }

  const image = document.createElement("img");
  image.src = getAssetUrl(item.src);
  image.alt = item.alt || "";
  image.loading = loading;
  image.style.objectFit = fit;
  return image;
};

const makeTagChip = (label) => {
  const chip = document.createElement("li");
  chip.textContent = label;
  return chip;
};

const createMontageSources = (projectFilter = () => true) =>
  projectAlbums.flatMap((project) => {
    if (!projectFilter(project)) {
      return [];
    }

    const poster = project.cover?.type === "image" ? project.cover.src : undefined;

    return (project.media || [])
      .filter((item) => item.type === "video")
      .map((item, index) => ({
        type: "video",
        src: item.src,
        alt: item.alt,
        label: item.label || `Clip ${index + 1}`,
        projectTitle: project.title,
        projectKicker: project.kicker,
        teaser: `${project.kicker} - ${item.label || `Clip ${index + 1}`}`,
        poster,
      }));
  });

const showcaseHighlightSources = createMontageSources();
const prototypeHighlightSources = createMontageSources((project) => project.id !== "dijoker");

const heroTracks = [
  {
    id: "production",
    label: "Showcase Reel",
    kicker: "Production Showcase",
    title: "Production work across games, simulation systems, and full-stack delivery.",
    summary:
      "This reel pulls from live company releases, shipped interactive builds, and focused R&D work to show the systems behind delivery: gameplay flow, UI state, backend-connected logic, debugging, and performance tuning.",
    tags: ["Production games", "Shipped systems", "Interactive implementation", "Full-stack support"],
    media: {
      type: "montage",
      label: "Portfolio highlight reel",
      detail: "Gameplay systems, UI state, backend-aware behavior, and production fixes across shipped work.",
      kicker: "Production showcase",
      sources: showcaseHighlightSources,
    },
  },
  {
    id: "prototype",
    label: "R&D Track",
    kicker: "Independent R&D",
    title: "Independent Unity builds focused on feel, rendering, and system behavior",
    summary:
      "Outside production work, I use Unity to pressure-test interaction ideas, rendering choices, and gameplay systems through real implementation. This track shows how I refine instincts by building, profiling, and iterating.",
    tags: ["Unity R&D", "Gameplay systems", "Rendering", "Iteration"],
    media: {
      type: "montage",
      label: "R&D highlight reel",
      detail: "Independent Unity builds, rendering studies, mobile interaction tests, and system-focused exploration.",
      kicker: "Independent R&D",
      sources: prototypeHighlightSources,
    },
  },
];

const heroStageMedia = document.getElementById("hero-stage-media");
const heroTrackLabel = document.getElementById("hero-track-label");
const heroTrackKicker = document.getElementById("hero-track-kicker");
const heroTrackTitle = document.getElementById("hero-track-title");
const heroTrackSummary = document.getElementById("hero-track-summary");
const heroTrackTags = document.getElementById("hero-track-tags");
const heroSwitchButtons = document.querySelectorAll(".hero-switch-button");
let heroMontageTimer = 0;
let heroMontageVideo = null;
let heroMontageBackdrop = null;
let heroMontageIndex = -1;

const safelyPlayVideo = (video) => {
  if (!(video instanceof HTMLMediaElement)) {
    return;
  }

  const playPromise = video.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
};

const resetClipTime = (video) => {
  if (!(video instanceof HTMLMediaElement) || !Number.isFinite(video.duration)) {
    return;
  }

  video.currentTime = 0;
};

const classifyMediaOrientation = (width, height) => {
  if (!width || !height) {
    return "landscape";
  }

  const ratio = width / height;

  if (ratio < 0.9) {
    return "portrait";
  }

  if (ratio < 1.2) {
    return "square";
  }

  return "landscape";
};

const applyHeroMontageFit = (frame, video) => {
  if (!(frame instanceof HTMLElement) || !(video instanceof HTMLMediaElement)) {
    return;
  }

  const orientation = classifyMediaOrientation(video.videoWidth, video.videoHeight);

  frame.dataset.mediaOrientation = orientation;

  if (heroStageMedia) {
    heroStageMedia.dataset.mediaOrientation = orientation;
  }

  if (orientation === "portrait" || orientation === "square") {
    video.style.objectFit = "contain";
    video.style.objectPosition = "center center";
    video.style.transform = "none";
    return;
  }

  video.style.objectFit = "cover";
  video.style.objectPosition = "center center";
  video.style.transform = "scale(1.03)";
};

const clearHeroMontage = () => {
  if (heroMontageTimer) {
    window.clearInterval(heroMontageTimer);
    heroMontageTimer = 0;
  }

  if (heroMontageVideo instanceof HTMLMediaElement) {
    heroMontageVideo.pause();
  }

  if (heroMontageBackdrop instanceof HTMLMediaElement) {
    heroMontageBackdrop.pause();
  }

  heroMontageVideo = null;
  heroMontageBackdrop = null;
  heroMontageIndex = -1;
};

const selectNextMontageIndex = (sources) => {
  if (!sources.length) {
    return -1;
  }

  return (heroMontageIndex + 1 + sources.length) % sources.length;
};

const updateHeroMontage = (video, media, titleNode, metaNode, dots = []) => {
  const sources = media.sources || [];
  const nextIndex = selectNextMontageIndex(sources);

  if (nextIndex < 0) {
    return;
  }

  heroMontageIndex = nextIndex;

  const activeSource = sources[nextIndex];

  if (titleNode) {
    titleNode.textContent = activeSource.label || `Company capture ${nextIndex + 1}`;
  }

  if (metaNode) {
    metaNode.textContent = `${nextIndex + 1} / ${sources.length} clips · randomized every 2s`;
  }

  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === nextIndex);
  });

  const nextSourceUrl = getAssetUrl(activeSource.src);

  const syncPlayback = () => {
    resetClipTime(video);
    safelyPlayVideo(video);
  };

  if (video.dataset.source !== nextSourceUrl) {
    video.dataset.source = nextSourceUrl;
    video.addEventListener("loadedmetadata", syncPlayback, { once: true });
    video.src = nextSourceUrl;
    video.load();
    return;
  }

  syncPlayback();
};

const updateHeroMontagePreview = (
  video,
  backdrop,
  media,
  titleNode,
  detailNode,
  metaNode,
  dots = []
) => {
  const sources = media.sources || [];
  const nextIndex = selectNextMontageIndex(sources);

  if (nextIndex < 0) {
    return;
  }

  heroMontageIndex = nextIndex;

  const activeSource = sources[nextIndex];
  const indicatorIndex = dots.length ? nextIndex % dots.length : -1;
  const nextSourceUrl = getAssetUrl(activeSource.src);

  if (titleNode) {
    titleNode.textContent =
      activeSource.projectTitle || activeSource.label || `Project ${nextIndex + 1}`;
  }

  if (detailNode) {
    detailNode.textContent =
      activeSource.teaser || media.detail || "Production-focused project highlights";
  }

  if (metaNode) {
    metaNode.textContent = `Clip ${nextIndex + 1} / ${sources.length}`;
  }

  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === indicatorIndex);
  });

  const syncPlayback = () => {
    resetClipTime(video);
    resetClipTime(backdrop);
    safelyPlayVideo(video);
    safelyPlayVideo(backdrop);
  };

  if (video.dataset.source !== nextSourceUrl) {
    video.dataset.source = nextSourceUrl;
    if (backdrop instanceof HTMLMediaElement) {
      backdrop.dataset.source = nextSourceUrl;
    }
    video.poster = "";

    video.addEventListener("loadedmetadata", syncPlayback, { once: true });
    video.src = nextSourceUrl;
    video.load();

    if (backdrop instanceof HTMLMediaElement) {
      backdrop.src = nextSourceUrl;
      backdrop.load();
    }
    return;
  }

  syncPlayback();
};

const createHeroMontage = (media) => {
  if (!Array.isArray(media.sources) || !media.sources.length) {
    return createMediaElement({
      type: "synthetic",
      label: "Production Release Track",
      detail: "TypeScript, Phaser, Cocos, gameplay flow, and backend-driven stability",
      kicker: media.kicker || "Live production stack",
      stats: ["Gameplay flow", "UI states", "Release stability"],
    });
  }

  const shell = document.createElement("div");
  shell.className = "hero-video-highlight";
  shell.dataset.mediaOrientation = "landscape";

  const backdrop = document.createElement("video");
  backdrop.className = "hero-video-backdrop";
  backdrop.muted = true;
  backdrop.loop = true;
  backdrop.playsInline = true;
  backdrop.preload = "auto";
  backdrop.setAttribute("aria-hidden", "true");

  const video = document.createElement("video");
  video.className = "hero-video-element";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.poster = "";
  video.setAttribute("aria-label", media.label || "Production highlight reel");
  video.addEventListener("loadedmetadata", () => applyHeroMontageFit(shell, video));

  const overlay = document.createElement("div");
  overlay.className = "hero-video-overlay";

  const kicker = document.createElement("span");
  kicker.className = "hero-video-kicker";
  kicker.textContent = media.kicker || "Live production stack";

  const title = document.createElement("strong");
  title.className = "hero-video-title";

  const detail = document.createElement("p");
  detail.className = "hero-video-detail";
  detail.textContent = media.detail || "Quick-cut company footage from live production work.";

  const meta = document.createElement("p");
  meta.className = "hero-video-meta";

  const dots = document.createElement("div");
  dots.className = "hero-video-dots";

  const dotItems = media.sources.slice(0, Math.min(media.sources.length, 6)).map((_, index) => {
    const dot = document.createElement("span");
    dot.className = "hero-video-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.dataset.dotIndex = String(index);
    dots.append(dot);
    return dot;
  });

  overlay.append(kicker, title, detail, meta, dots);
  shell.append(backdrop, video, overlay);

  heroMontageVideo = video;
  heroMontageBackdrop = backdrop;
  updateHeroMontagePreview(video, backdrop, media, title, detail, meta, dotItems);

  if (!reduceMotion && media.sources.length > 1) {
    heroMontageTimer = window.setInterval(() => {
      updateHeroMontagePreview(video, backdrop, media, title, detail, meta, dotItems);
    }, 3000);
  }

  return shell;
};

const renderHeroTrack = (trackId) => {
  const track = heroTracks.find((item) => item.id === trackId) || heroTracks[0];

  if (!track || !heroStageMedia) {
    return;
  }

  clearHeroMontage();

  heroSwitchButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.track === track.id);
  });

  heroStageMedia.dataset.mediaOrientation = "landscape";
  heroStageMedia.innerHTML = "";

  if (track.media.type === "montage") {
    heroStageMedia.append(createHeroMontage(track.media));
  } else {
    heroStageMedia.append(
      createMediaElement(track.media, {
        autoplay: !reduceMotion && track.media.type === "video",
        loop: track.media.type === "video",
        muted: true,
        fit: "cover",
        loading: "eager",
      })
    );
  }

  if (heroTrackLabel) {
    heroTrackLabel.textContent = track.label;
  }

  if (heroTrackKicker) {
    heroTrackKicker.textContent = track.kicker;
  }

  if (heroTrackTitle) {
    heroTrackTitle.textContent = track.title;
  }

  if (heroTrackSummary) {
    heroTrackSummary.textContent = track.summary;
  }

  if (heroTrackTags) {
    heroTrackTags.innerHTML = "";
    track.tags.forEach((tag) => heroTrackTags.append(makeTagChip(tag)));
  }
};

heroSwitchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    renderHeroTrack(button.dataset.track);
  });
});

renderHeroTrack(heroTracks[0].id);

const projectGrid = document.getElementById("project-grid");
const projectGalleryTotal = document.getElementById("project-gallery-total");
const projectModal = document.getElementById("project-modal");
const profilePreviewOpen = document.getElementById("profile-preview-open");
const profilePreviewModal = document.getElementById("profile-preview-modal");
const profilePreviewClose = document.getElementById("profile-preview-close");
const projectModalKicker = document.getElementById("project-modal-kicker");
const projectModalTitle = document.getElementById("project-modal-title");
const projectModalSummary = document.getElementById("project-modal-summary");
const projectModalCount = document.getElementById("project-modal-count");
const projectModalStage = document.getElementById("project-modal-stage");
const projectModalCurrentLabel = document.getElementById("project-modal-current-label");
const projectModalTags = document.getElementById("project-modal-tags");
const projectModalHighlights = document.getElementById("project-modal-highlights");
const projectModalLinksWrap = document.getElementById("project-modal-links-wrap");
const projectModalLinks = document.getElementById("project-modal-links");
const projectModalThumbs = document.getElementById("project-modal-thumbs");
const projectModalPrev = document.getElementById("project-modal-prev");
const projectModalNext = document.getElementById("project-modal-next");
const projectModalClose = document.getElementById("project-modal-close");

let currentProjectIndex = 0;
let currentMediaIndex = 0;
let activeProjectTrigger = null;
let activeProfileTrigger = null;

const syncModalLock = () => {
  const hasOpenModal =
    Boolean(projectModal && !projectModal.hidden) ||
    Boolean(profilePreviewModal && !profilePreviewModal.hidden);

  document.body.classList.toggle("modal-open", hasOpenModal);
};

const createPreviewFigure = (item) => {
  const figure = document.createElement("div");
  figure.className = "media-thumb-figure";
  figure.append(
    createMediaElement(item, {
      fit: "cover",
      autoplay: false,
      loop: false,
      muted: true,
      preload: "metadata",
    })
  );
  return figure;
};

const createProjectPreview = (project) => {
  const preview = document.createElement("div");
  const cover = project.cover || {};

  preview.className = "project-media project-entry-media";

  if (cover.variant) {
    preview.classList.add(`project-entry-media--${cover.variant}`);
  }

  if (cover.type === "image" || cover.type === "video") {
    preview.append(
      createMediaElement(cover, {
        fit: cover.fit || "cover",
        autoplay: !reduceMotion && cover.type === "video",
        loop: cover.type === "video",
        muted: true,
        preload: "metadata",
      })
    );
  } else {
    preview.classList.add("project-entry-media--synthetic");
    preview.append(createMediaElement(cover));
  }

  return preview;
};

const renderProjectCards = () => {
  if (!projectGrid) {
    return;
  }

  projectGrid.innerHTML = "";

  projectAlbums.forEach((project, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-entry panel-shell";
    button.dataset.projectIndex = String(index);
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "project-modal");

    const preview = createProjectPreview(project);
    const body = document.createElement("div");
    body.className = "project-body";

    const meta = document.createElement("div");
    meta.className = "project-entry-head";

    const kicker = document.createElement("p");
    kicker.className = "project-kicker";
    kicker.textContent = project.kicker;

    const count = document.createElement("span");
    count.className = "project-entry-count";
    count.textContent = `${project.media.length} assets`;

    const title = document.createElement("h3");
    title.textContent = project.title;

    const summary = document.createElement("p");
    summary.className = "project-entry-summary";
    summary.textContent = project.summary;

    const highlights = document.createElement("ul");
    highlights.className = "project-entry-highlights";
    (project.highlights || []).slice(0, 2).forEach((highlight) => {
      const item = document.createElement("li");
      item.textContent = highlight;
      highlights.append(item);
    });

    const tags = document.createElement("ul");
    tags.className = "project-entry-tags";
    project.tags.slice(0, 3).forEach((tag) => tags.append(makeTagChip(tag)));

    const link = document.createElement("span");
    link.className = "project-entry-link";
    link.textContent = "Open project deep dive";

    meta.append(kicker, count);
    body.append(meta, title, summary, highlights, tags, link);
    button.append(preview, body);

    button.addEventListener("click", () => {
      openProjectModal(index, button);
    });

    projectGrid.append(button);
  });

  if (projectGalleryTotal) {
    const totalAssets = projectAlbums.reduce((sum, project) => sum + project.media.length, 0);
    projectGalleryTotal.textContent = `${totalAssets} assets`;
  }
};

const renderProjectStage = (project, item) => {
  if (!projectModalStage) {
    return;
  }

  projectModalStage.innerHTML = "";

  if (!item) {
    return;
  }

  projectModalStage.append(
    createMediaElement(item, {
      fit: "contain",
      controls: item.type === "video",
      autoplay: !reduceMotion && item.type === "video",
      loop: item.type === "video",
      muted: true,
      loading: "eager",
      preload: "metadata",
    })
  );
};

const renderModalThumbs = (project) => {
  if (!projectModalThumbs) {
    return;
  }

  projectModalThumbs.innerHTML = "";

  project.media.forEach((item, index) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "media-thumb";
    thumb.classList.toggle("is-active", index === currentMediaIndex);

    const figure = createPreviewFigure(item);
    const label = document.createElement("span");
    label.className = "media-thumb-label";
    label.textContent = item.label;

    thumb.append(figure, label);

    thumb.addEventListener("click", () => {
      currentMediaIndex = index;
      renderProjectModal();
    });

    projectModalThumbs.append(thumb);
  });

  const activeThumb = projectModalThumbs.querySelector(".media-thumb.is-active");

  if (activeThumb) {
    activeThumb.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
};

const renderProjectLinks = (project) => {
  if (!projectModalLinksWrap || !projectModalLinks) {
    return;
  }

  projectModalLinks.innerHTML = "";

  const links = Array.isArray(project.links)
    ? project.links.filter((item) => item?.href && item?.label)
    : [];

  projectModalLinksWrap.hidden = !links.length;

  links.forEach((item) => {
    const link = document.createElement("a");
    link.className = "button button-secondary project-modal-link";
    link.href = item.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.label;
    projectModalLinks.append(link);
  });
};

const renderProjectModal = () => {
  const project = projectAlbums[currentProjectIndex];

  if (!project) {
    return;
  }

  const activeItem = project.media[currentMediaIndex];

  if (projectModalKicker) {
    projectModalKicker.textContent = project.kicker;
  }

  if (projectModalTitle) {
    projectModalTitle.textContent = project.title;
  }

  if (projectModalSummary) {
    projectModalSummary.textContent = project.summary;
  }

  if (projectModalCount) {
    projectModalCount.textContent = `${currentMediaIndex + 1} / ${project.media.length} assets`;
  }

  if (projectModalCurrentLabel) {
    projectModalCurrentLabel.textContent = activeItem ? activeItem.label : "Active capture";
  }

  if (projectModalTags) {
    projectModalTags.innerHTML = "";
    project.tags.forEach((tag) => projectModalTags.append(makeTagChip(tag)));
  }

  if (projectModalHighlights) {
    projectModalHighlights.innerHTML = "";
    (project.highlights || []).forEach((highlight) => {
      const item = document.createElement("li");
      item.textContent = highlight;
      projectModalHighlights.append(item);
    });
  }

  renderProjectLinks(project);
  renderProjectStage(project, activeItem);
  renderModalThumbs(project);
};

const openProjectModal = (projectIndex, trigger) => {
  if (!projectModal) {
    return;
  }

  activeProjectTrigger = trigger || document.activeElement;
  currentProjectIndex = projectIndex;
  currentMediaIndex = 0;

  renderProjectModal();
  projectModal.hidden = false;
  syncModalLock();
  projectModalClose?.focus({ preventScroll: true });
};

const closeProjectModal = () => {
  if (!projectModal || projectModal.hidden) {
    return;
  }

  projectModal.hidden = true;
  syncModalLock();

  if (activeProjectTrigger && typeof activeProjectTrigger.focus === "function") {
    activeProjectTrigger.focus({ preventScroll: true });
  }

  activeProjectTrigger = null;
};

const openProfilePreview = (trigger) => {
  if (!profilePreviewModal) {
    return;
  }

  activeProfileTrigger = trigger || document.activeElement;
  profilePreviewModal.hidden = false;
  syncModalLock();
  profilePreviewClose?.focus({ preventScroll: true });
};

const closeProfilePreview = () => {
  if (!profilePreviewModal || profilePreviewModal.hidden) {
    return;
  }

  profilePreviewModal.hidden = true;
  syncModalLock();

  if (activeProfileTrigger && typeof activeProfileTrigger.focus === "function") {
    activeProfileTrigger.focus({ preventScroll: true });
  }

  activeProfileTrigger = null;
};

if (projectAlbums.length) {
  renderProjectCards();

  projectModalPrev?.addEventListener("click", () => {
    const project = projectAlbums[currentProjectIndex];
    currentMediaIndex = (currentMediaIndex - 1 + project.media.length) % project.media.length;
    renderProjectModal();
  });

  projectModalNext?.addEventListener("click", () => {
    const project = projectAlbums[currentProjectIndex];
    currentMediaIndex = (currentMediaIndex + 1) % project.media.length;
    renderProjectModal();
  });

  projectModalClose?.addEventListener("click", closeProjectModal);

  projectModal?.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof HTMLElement && target.hasAttribute("data-modal-close")) {
      closeProjectModal();
    }
  });
}

profilePreviewOpen?.addEventListener("click", () => {
  openProfilePreview(profilePreviewOpen);
});

profilePreviewClose?.addEventListener("click", closeProfilePreview);

profilePreviewModal?.addEventListener("click", (event) => {
  const target = event.target;

  if (target instanceof HTMLElement && target.hasAttribute("data-profile-preview-close")) {
    closeProfilePreview();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (profilePreviewModal && !profilePreviewModal.hidden) {
      closeProfilePreview();
      return;
    }

    if (projectModal && !projectModal.hidden) {
      closeProjectModal();
      return;
    }
  }

  if (!projectModal || projectModal.hidden) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    projectModalPrev?.click();
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    projectModalNext?.click();
  }
});
