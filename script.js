const projects = window.PROJECT_ALBUMS || [];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const $ = (id) => document.getElementById(id);
const assetUrl = (src) => encodeURI(src);
const worldMode = () => document.documentElement.classList.contains("world");

const yearTarget = $("current-year");
if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

const describeFootage = (project) => {
  const media = project.media || [];
  const clips = media.filter((item) => item.type === "video").length;
  const shots = media.length - clips;
  const parts = [];

  if (clips) {
    parts.push(`${clips} ${clips === 1 ? "clip" : "clips"}`);
  }

  if (shots) {
    parts.push(`${shots} ${shots === 1 ? "shot" : "shots"}`);
  }

  return parts.join(", ") || "None yet";
};

const fillStats = (list, project) => {
  if (!list) {
    return;
  }

  const values = {
    status: project.status || project.kicker,
    engine: project.stats?.engine,
    platform: project.stats?.platform,
    footage: describeFootage(project),
  };

  list.querySelectorAll("[data-stat]").forEach((node) => {
    node.textContent = values[node.dataset.stat] || "\u2014";
  });
};

const playQuietly = (video) => {
  const attempt = video.play();

  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {});
  }
};

/* Stage: the selected game plays here; roster hover/focus previews before opening. */

const stageVideo = $("stage-video");
const stageScreen = document.querySelector(".stage-screen");
const stageName = $("stage-name");
const stageTagline = $("stage-tagline");
const stageStats = $("stage-stats");
const stageOpen = $("stage-open");
const stageOpenLabel = $("stage-open-label");
const roster = $("project-grid");

let stageIndex = -1;
let swapTimer = 0;
let previewTimer = 0;

const paintStage = (project) => {
  const select = project.select || {};

  if (stageVideo && !worldMode()) {
    stageVideo.poster = select.poster ? assetUrl(select.poster) : "";

    if (select.loop) {
      stageVideo.src = assetUrl(select.loop);

      if (!reduceMotion) {
        playQuietly(stageVideo);
      }
    } else {
      stageVideo.removeAttribute("src");
      stageVideo.load();
    }
  }

  stageName.textContent = project.name || project.title;
  stageTagline.textContent = project.tagline || project.summary;
  stageOpenLabel.textContent = `Open ${project.name || project.title}`;
  fillStats(stageStats, project);

  roster?.querySelectorAll(".tile").forEach((tile) => {
    const current = Number(tile.dataset.index) === stageIndex;
    tile.classList.toggle("is-current", current);

    if (current && roster.scrollWidth > roster.clientWidth) {
      const item = tile.parentElement;
      const left = item.offsetLeft;
      const right = left + item.offsetWidth;

      if (left < roster.scrollLeft || right > roster.scrollLeft + roster.clientWidth) {
        roster.scrollTo({ left: left - 16, behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
  });

  window.PortfolioMotion?.stagePainted?.(project, stageIndex);
};

const setStage = (index) => {
  const count = projects.length;

  if (!count) {
    return;
  }

  const next = ((index % count) + count) % count;

  if (next === stageIndex) {
    return;
  }

  stageIndex = next;
  const project = projects[next];

  if (reduceMotion || !stageScreen) {
    paintStage(project);
    return;
  }

  window.clearTimeout(swapTimer);
  stageScreen.classList.remove("is-swapping");
  void stageScreen.offsetWidth;
  stageScreen.classList.add("is-swapping");

  swapTimer = window.setTimeout(() => {
    paintStage(project);
    swapTimer = window.setTimeout(() => stageScreen.classList.remove("is-swapping"), 260);
  }, 170);
};

const queuePreview = (index) => {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => setStage(index), 110);
};

const rosterColumns = () => {
  if (!roster) {
    return 1;
  }

  return getComputedStyle(roster).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
};

const renderRoster = () => {
  if (!roster) {
    return;
  }

  roster.innerHTML = "";

  projects.forEach((project, index) => {
    const item = document.createElement("li");
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.dataset.index = String(index);
    tile.setAttribute("aria-haspopup", "dialog");
    tile.setAttribute(
      "aria-label",
      `${project.name || project.title}, ${project.status || project.kicker}. Open project`
    );

    const frame = document.createElement("span");
    frame.className = "tile-frame";

    const art = document.createElement("img");
    art.className = "tile-art";
    art.src = assetUrl(project.select?.tile || project.cover?.src || "");
    art.alt = "";
    art.loading = "lazy";
    art.decoding = "async";

    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = project.name || project.title;

    const cursor = document.createElement("span");
    cursor.className = "tile-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.textContent = "P1";

    frame.append(art, name, cursor);
    tile.append(frame);
    item.append(tile);
    roster.append(item);

    if (finePointer) {
      tile.addEventListener("pointerenter", () => queuePreview(index));
    }

    tile.addEventListener("focus", () => queuePreview(index));
    tile.addEventListener("click", () => {
      window.clearTimeout(previewTimer);
      setStage(index);
      openProjectModal(index, tile);
    });
  });

  roster.addEventListener("keydown", (event) => {
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -rosterColumns(), ArrowDown: rosterColumns() };
    const step = keys[event.key];
    const current = event.target.closest?.(".tile");

    if (!step || !current) {
      return;
    }

    const target = Number(current.dataset.index) + step;
    const tiles = roster.querySelectorAll(".tile");

    if (target >= 0 && target < tiles.length) {
      event.preventDefault();
      tiles[target].focus();
      queuePreview(target);
    }
  });
};

if (projects.length) {
  renderRoster();
  setStage(0);

  $("stage-prev")?.addEventListener("click", () => setStage(stageIndex - 1));
  $("stage-next")?.addEventListener("click", () => setStage(stageIndex + 1));
  stageOpen?.addEventListener("click", () => openProjectModal(stageIndex, stageOpen));
}

if (stageVideo && !reduceMotion && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      playQuietly(stageVideo);
    } else {
      stageVideo.pause();
    }
  }).observe(stageVideo);
}

/* Dossier: every capture, build notes, and links for one project. */

const modal = $("project-modal");
const modalDialog = modal?.querySelector(".dossier-dialog");
const modalTitle = $("project-modal-title");
const modalStats = $("project-modal-stats");
const modalSummary = $("project-modal-summary");
const modalStage = $("project-modal-stage");
const modalLabel = $("project-modal-current-label");
const modalCount = $("project-modal-count");
const modalThumbs = $("project-modal-thumbs");
const modalNotes = $("project-modal-highlights");
const modalTags = $("project-modal-tags");
const modalLinksWrap = $("project-modal-links-wrap");
const modalLinks = $("project-modal-links");
const modalClose = $("project-modal-close");
const modalPrev = $("project-modal-prev");
const modalNext = $("project-modal-next");
const splash = $("wipe");
const splashName = $("wipe-name");
const photoModal = $("profile-preview-modal");
const photoOpen = $("profile-preview-open");
const photoClose = $("profile-preview-close");
const modalDemosWrap = $("project-modal-demos-wrap");
const modalDemos = $("project-modal-demos");
const demoPlayer = $("demo-player");
const demoDialog = demoPlayer?.querySelector(".demo-dialog");
const demoTitle = $("demo-title");
const demoFrame = $("demo-frame");
const demoLoading = $("demo-loading");
const demoNewTab = $("demo-newtab");
const demoClose = $("demo-close");
const demoMode = $("demo-mode");
const demoStart = $("demo-start");
const demoBack = $("demo-back");
const demoArt = $("demo-art");
const demoArtImg = $("demo-art-img");
const demoInfo = $("demo-info");
const demoStory = $("demo-story");
const demoDesign = $("demo-design");
const demoFeaturesWrap = $("demo-features-wrap");
const demoFeatures = $("demo-features");
const demoShotsWrap = $("demo-shots-wrap");
const demoShots = $("demo-shots");
const demoPage = $("demo-page");

let modalProject = 0;
let modalMedia = 0;
let modalTrigger = null;
let photoTrigger = null;
let demoTrigger = null;
let splashTimer = 0;

const sectionSheet = $("section-sheet");
const sectionClose = $("section-close");
let openSectionEl = null;
let sectionTrigger = null;

const syncScrollLock = () => {
  const open =
    (modal && !modal.hidden) ||
    (photoModal && !photoModal.hidden) ||
    (demoPlayer && !demoPlayer.hidden) ||
    Boolean(openSectionEl);
  document.body.classList.toggle("modal-open", Boolean(open));
  window.PortfolioMotion?.scrollLock?.(Boolean(open));
};

const createMedia = (item, { thumb = false } = {}) => {
  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = assetUrl(item.src);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    if (item.poster) {
      video.poster = assetUrl(item.poster);
    }

    if (!thumb) {
      video.controls = true;
      video.loop = true;
      video.autoplay = !reduceMotion;
    }

    return video;
  }

  const image = document.createElement("img");
  image.src = assetUrl(item.src);
  image.alt = thumb ? "" : item.alt || "";
  image.loading = thumb ? "lazy" : "eager";
  image.decoding = "async";
  return image;
};

const renderModalMedia = () => {
  const project = projects[modalProject];
  const media = project?.media || [];
  const item = media[modalMedia];

  if (!item) {
    return;
  }

  modalStage.innerHTML = "";
  modalStage.append(createMedia(item));
  modalLabel.textContent = item.label || "Capture";
  modalCount.textContent = `${modalMedia + 1} / ${media.length}`;

  modalThumbs.querySelectorAll(".thumb").forEach((thumb, index) => {
    const active = index === modalMedia;
    thumb.classList.toggle("is-current", active);
    thumb.setAttribute("aria-current", active ? "true" : "false");

    if (active) {
      thumb.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest", inline: "nearest" });
    }
  });

  const single = media.length < 2;
  modalPrev.hidden = single;
  modalNext.hidden = single;
};

const renderModal = () => {
  const project = projects[modalProject];

  if (!project) {
    return;
  }

  modalTitle.textContent = project.name || project.title;
  modalSummary.textContent = project.summary;
  fillStats(modalStats, project);

  const demos = (project.demos || []).filter((demo) => demo?.url && demo?.name);
  modalDemos.innerHTML = "";
  modalDemosWrap.hidden = !demos.length;
  demos.forEach((demo) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "demo-play";

    if (demo.thumb) {
      const art = document.createElement("img");
      art.src = assetUrl(demo.thumb);
      art.alt = "";
      art.loading = "lazy";
      art.decoding = "async";
      button.append(art);
    }

    const name = document.createElement("span");
    name.className = "demo-play-name";
    name.textContent = demo.name;
    button.append(name);
    button.addEventListener("click", () => openGame(demo, button));
    item.append(button);
    modalDemos.append(item);
  });

  modalNotes.innerHTML = "";
  (project.highlights || []).forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    modalNotes.append(item);
  });

  modalTags.innerHTML = "";
  (project.tags || []).forEach((tag) => {
    const item = document.createElement("li");
    item.textContent = tag;
    modalTags.append(item);
  });

  const links = (project.links || []).filter((link) => link?.href && link?.label);
  modalLinks.innerHTML = "";
  modalLinksWrap.hidden = !links.length;
  links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "dossier-link";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-out" /></svg>';
    anchor.append(document.createTextNode(link.label));
    modalLinks.append(anchor);
  });

  modalThumbs.innerHTML = "";
  (project.media || []).forEach((item, index) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "thumb";
    thumb.setAttribute("aria-label", item.label || `Capture ${index + 1}`);
    thumb.append(createMedia(item, { thumb: true }));

    if (item.type === "video") {
      const badge = document.createElement("span");
      badge.className = "thumb-play";
      badge.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-play" /></svg>';
      thumb.append(badge);
    }

    thumb.addEventListener("click", () => {
      modalMedia = index;
      renderModalMedia();
    });
    modalThumbs.append(thumb);
  });

  renderModalMedia();
};

const revealModal = () => {
  modal.hidden = false;
  syncScrollLock();
  modalClose?.focus({ preventScroll: true });
};

function openProjectModal(index, trigger) {
  if (!modal || !projects[index]) {
    return;
  }

  modalTrigger = trigger || document.activeElement;
  modalProject = index;
  modalMedia = 0;
  renderModal();

  if (reduceMotion || !splash) {
    revealModal();
    return;
  }

  const project = projects[index];

  if (window.PortfolioMotion?.wipe) {
    window.PortfolioMotion.wipe(project, revealModal);
    return;
  }

  splashName.textContent = project.name || project.title;
  window.clearTimeout(splashTimer);
  splash.classList.remove("is-playing");
  void splash.offsetWidth;
  splash.classList.add("is-playing");
  splashTimer = window.setTimeout(revealModal, 380);
  window.setTimeout(() => splash.classList.remove("is-playing"), 900);
}

const closeProjectModal = () => {
  if (!modal || modal.hidden) {
    return;
  }

  modal.hidden = true;
  modalStage.innerHTML = "";
  syncScrollLock();
  modalTrigger?.focus?.({ preventScroll: true });
  modalTrigger = null;
};

const stepModal = (step) => {
  const media = projects[modalProject]?.media || [];

  if (media.length < 2) {
    return;
  }

  modalMedia = (modalMedia + step + media.length) % media.length;
  renderModalMedia();
};

modalPrev?.addEventListener("click", () => stepModal(-1));
modalNext?.addEventListener("click", () => stepModal(1));
modalClose?.addEventListener("click", closeProjectModal);
modal?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.hasAttribute("data-modal-close")) {
    closeProjectModal();
  }
});

let demoGame = null;

const demoPlaying = () => Boolean(demoPlayer?.classList.contains("is-playing"));

const showGameDetails = () => {
  demoPlayer.classList.remove("is-playing");
  demoFrame.src = "about:blank";
  demoFrame.hidden = true;
  demoLoading.hidden = true;
  demoArt.hidden = !demoGame?.art;
  demoInfo.hidden = false;
  demoStart.hidden = false;
  demoBack.hidden = true;
  demoMode.textContent = demoGame?.released ? `Released ${demoGame.released}` : "";
  demoMode.hidden = !demoMode.textContent;
};

const startGame = () => {
  if (!demoGame) {
    return;
  }

  demoPlayer.classList.add("is-playing");
  demoArt.hidden = true;
  demoInfo.hidden = true;
  demoLoading.hidden = false;
  demoFrame.hidden = false;
  demoFrame.src = demoGame.url;
  demoStart.hidden = true;
  demoBack.hidden = false;
  demoMode.textContent = "Demo mode, play credits only";
  demoMode.hidden = false;
  demoBack.focus({ preventScroll: true });
};

const backToDetails = () => {
  showGameDetails();
  demoStart.focus({ preventScroll: true });
};

function openGame(demo, trigger) {
  if (!demoPlayer || !demoFrame) {
    return;
  }

  demoGame = demo;
  demoTrigger = trigger || document.activeElement;
  modalStage?.querySelector("video")?.pause();
  demoTitle.textContent = demo.name;
  demoFrame.title = `${demo.name} demo`;
  demoNewTab.href = demo.url;
  demoArtImg.src = demo.art ? assetUrl(demo.art) : "";
  demoArtImg.alt = demo.art ? `${demo.name} key art` : "";
  demoArt.setAttribute("aria-label", `Play the ${demo.name} demo`);
  demoStory.textContent = demo.story || "";
  demoDesign.textContent = demo.design || "";

  demoFeatures.innerHTML = "";
  (demo.features || []).forEach((feature) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = feature.name;
    item.append(name, document.createTextNode(` ${feature.text}`));
    demoFeatures.append(item);
  });
  demoFeaturesWrap.hidden = !demo.features?.length;

  demoShots.innerHTML = "";
  (demo.shots || []).forEach((shot, index) => {
    const image = document.createElement("img");
    image.src = assetUrl(shot);
    image.alt = `${demo.name} screen ${index + 1}`;
    image.loading = "lazy";
    image.decoding = "async";
    demoShots.append(image);
  });
  demoShotsWrap.hidden = !demo.shots?.length;

  demoPage.hidden = !demo.page;
  demoPage.href = demo.page || "#";
  demoPlayer.scrollTop = 0;
  demoInfo.scrollTop = 0;
  demoPlayer.hidden = false;
  syncScrollLock();

  if (demo.story) {
    showGameDetails();
    demoStart.focus({ preventScroll: true });
    window.PortfolioMotion?.gameOpened?.(demoPlayer);
  } else {
    startGame();
  }
}

const closeDemo = () => {
  if (!demoPlayer || demoPlayer.hidden) {
    return;
  }

  demoPlayer.hidden = true;
  demoPlayer.classList.remove("is-playing");
  demoFrame.src = "about:blank";
  demoGame = null;
  syncScrollLock();
  demoTrigger?.focus?.({ preventScroll: true });
  demoTrigger = null;
};

const backDemo = () => {
  if (demoPlaying() && demoGame?.story) {
    backToDetails();
  } else {
    closeDemo();
  }
};

demoFrame?.addEventListener("load", () => {
  if (demoFrame.src !== "about:blank") {
    demoLoading.hidden = true;
  }
});
demoStart?.addEventListener("click", startGame);
demoArt?.addEventListener("click", startGame);
demoBack?.addEventListener("click", backToDetails);
demoClose?.addEventListener("click", closeDemo);
demoPlayer?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.hasAttribute("data-demo-close")) {
    closeDemo();
  }
});

const openPhoto = () => {
  if (!photoModal) {
    return;
  }

  photoTrigger = document.activeElement;
  photoModal.hidden = false;
  syncScrollLock();
  photoClose?.focus({ preventScroll: true });
};

const closePhoto = () => {
  if (!photoModal || photoModal.hidden) {
    return;
  }

  photoModal.hidden = true;
  syncScrollLock();
  photoTrigger?.focus?.({ preventScroll: true });
  photoTrigger = null;
};

photoOpen?.addEventListener("click", openPhoto);
photoClose?.addEventListener("click", closePhoto);
photoModal?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.hasAttribute("data-profile-preview-close")) {
    closePhoto();
  }
});

/* Section panels: in the play world, About, Skills, Career and Contact open over the floor. */

const closeSection = () => {
  if (!openSectionEl) {
    return;
  }

  openSectionEl.classList.remove("is-open");
  openSectionEl.removeAttribute("role");
  openSectionEl.removeAttribute("aria-modal");
  openSectionEl = null;
  sectionSheet.append(sectionClose);
  sectionSheet.hidden = true;
  syncScrollLock();
  window.PortfolioMotion?.sectionClosed?.();
  sectionTrigger?.focus?.({ preventScroll: true });
  sectionTrigger = null;
};

const openSection = (id, trigger) => {
  const section = $(id);

  if (!section || !sectionSheet) {
    return;
  }

  if (openSectionEl && openSectionEl !== section) {
    openSectionEl.classList.remove("is-open");
  }

  sectionTrigger = trigger || document.activeElement;
  openSectionEl = section;
  section.classList.add("is-open");
  section.setAttribute("role", "dialog");
  section.setAttribute("aria-modal", "true");
  section.prepend(sectionClose);
  section.scrollTop = 0;
  sectionSheet.hidden = false;
  syncScrollLock();
  sectionClose?.focus({ preventScroll: true });
  window.PortfolioMotion?.sectionOpened?.(section);
};

sectionClose?.addEventListener("click", closeSection);
sectionSheet?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.hasAttribute("data-section-close")) {
    closeSection();
  }
});

const trapFocus = (container, event) => {
  const focusable = [...container.querySelectorAll("button, a[href], video[controls], iframe, [tabindex]:not([tabindex='-1'])")].filter(
    (node) => !node.hidden && node.offsetParent !== null
  );

  if (!focusable.length) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

window.addEventListener("keydown", (event) => {
  const photoOpenNow = photoModal && !photoModal.hidden;
  const modalOpenNow = modal && !modal.hidden;
  const demoOpenNow = demoPlayer && !demoPlayer.hidden;

  if (event.key === "Escape") {
    if (demoOpenNow) {
      backDemo();
    } else if (photoOpenNow) {
      closePhoto();
    } else if (modalOpenNow) {
      closeProjectModal();
    } else if (openSectionEl) {
      closeSection();
    }
    return;
  }

  if (event.key === "Tab") {
    if (demoOpenNow && demoDialog) {
      trapFocus(demoDialog, event);
    } else if (openSectionEl && !modalOpenNow && !photoOpenNow) {
      trapFocus(openSectionEl, event);
    } else if (photoOpenNow) {
      trapFocus(photoModal, event);
    } else if (modalOpenNow && modalDialog) {
      trapFocus(modalDialog, event);
    }
    return;
  }

  if (!modalOpenNow && !photoOpenNow && !demoOpenNow) {
    handleSelectKeys(event);
    return;
  }

  if (!modalOpenNow || demoOpenNow || event.target instanceof HTMLVideoElement) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepModal(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    stepModal(1);
  }
});

/* Game controls: keys, swipe, and gamepad drive the select screen like a real roster. */

const selectSection = $("select");

function selectInView() {
  if (!selectSection) {
    return false;
  }

  const box = selectSection.getBoundingClientRect();
  return box.bottom > window.innerHeight * 0.35 && box.top < window.innerHeight * 0.6;
}

function handleSelectKeys(event) {
  if (!projects.length || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const target = event.target;
  const idle = target === document.body || target === document.documentElement;

  if (!idle || !selectInView()) {
    return;
  }

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === "ArrowLeft" || key === "a") {
    event.preventDefault();
    setStage(stageIndex - 1);
  } else if (key === "ArrowRight" || key === "d") {
    event.preventDefault();
    setStage(stageIndex + 1);
  } else if (key === "Enter") {
    event.preventDefault();
    openProjectModal(stageIndex, stageOpen);
  }
}

if (stageScreen && projects.length) {
  let swipe = null;

  stageScreen.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }

    swipe = { x: event.clientX, y: event.clientY };
  });

  stageScreen.addEventListener("pointerup", (event) => {
    if (!swipe) {
      return;
    }

    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;

    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      setStage(stageIndex + (dx < 0 ? 1 : -1));
    }
  });

  stageScreen.addEventListener("pointercancel", () => {
    swipe = null;
  });
}

const padHint = $("controls-pad");
let padFrame = 0;
let padLast = { dir: 0, a: false, b: false };
let padRepeatAt = 0;

const padBack = () => {
  if (demoPlayer && !demoPlayer.hidden) {
    backDemo();
  } else if (photoModal && !photoModal.hidden) {
    closePhoto();
  } else if (modal && !modal.hidden) {
    closeProjectModal();
  } else {
    closeSection();
  }
};

const padMove = (dir) => {
  if (demoPlayer && !demoPlayer.hidden) {
    return;
  }

  if (modal && !modal.hidden) {
    stepModal(dir);
  } else if (!worldMode()) {
    setStage(stageIndex + dir);
  }
};

const padConfirm = () => {
  if (demoPlayer && !demoPlayer.hidden) {
    if (!demoPlaying()) {
      startGame();
    }
    return;
  }

  const anyOpen = (modal && !modal.hidden) || (photoModal && !photoModal.hidden) || openSectionEl;

  if (!anyOpen && projects.length && !worldMode()) {
    openProjectModal(stageIndex, stageOpen);
  }
};

const pollPad = (time) => {
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);

  if (!pad) {
    padFrame = 0;
    return;
  }

  const axis = pad.axes[0] || 0;
  const left = pad.buttons[14]?.pressed || axis < -0.6;
  const right = pad.buttons[15]?.pressed || axis > 0.6;
  const dir = left ? -1 : right ? 1 : 0;
  const a = Boolean(pad.buttons[0]?.pressed);
  const b = Boolean(pad.buttons[1]?.pressed);

  if (dir && (dir !== padLast.dir || time >= padRepeatAt)) {
    padMove(dir);
    padRepeatAt = time + (dir === padLast.dir ? 180 : 420);
  }

  if (a && !padLast.a) {
    padConfirm();
  }

  if (b && !padLast.b) {
    padBack();
  }

  padLast = { dir, a, b };
  padFrame = window.requestAnimationFrame(pollPad);
};

window.addEventListener("gamepadconnected", () => {
  if (padHint) {
    padHint.hidden = false;
  }

  if (!padFrame) {
    padFrame = window.requestAnimationFrame(pollPad);
  }
});

window.addEventListener("gamepaddisconnected", () => {
  const anyLeft = [...(navigator.getGamepads?.() || [])].some(Boolean);

  if (padHint && !anyLeft) {
    padHint.hidden = true;
  }
});

window.Portfolio = {
  openProject: (index, trigger) => openProjectModal(index, trigger),
  openSection,
  closeSection,
  anyOpen: () =>
    Boolean(
      (modal && !modal.hidden) ||
        (photoModal && !photoModal.hidden) ||
        (demoPlayer && !demoPlayer.hidden) ||
        openSectionEl
    ),
};
