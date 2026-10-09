const projects = window.PROJECT_ALBUMS || [];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const $ = (id) => document.getElementById(id);
const assetUrl = (src) => encodeURI(src);

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

  if (stageVideo) {
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
const splash = $("vs-splash");
const splashName = $("vs-name");
const photoModal = $("profile-preview-modal");
const photoOpen = $("profile-preview-open");
const photoClose = $("profile-preview-close");

let modalProject = 0;
let modalMedia = 0;
let modalTrigger = null;
let photoTrigger = null;
let splashTimer = 0;

const syncScrollLock = () => {
  const open = (modal && !modal.hidden) || (photoModal && !photoModal.hidden);
  document.body.classList.toggle("modal-open", Boolean(open));
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

const trapFocus = (container, event) => {
  const focusable = [...container.querySelectorAll("button, a[href], video[controls], [tabindex]:not([tabindex='-1'])")].filter(
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

  if (event.key === "Escape") {
    if (photoOpenNow) {
      closePhoto();
    } else if (modalOpenNow) {
      closeProjectModal();
    }
    return;
  }

  if (event.key === "Tab") {
    if (photoOpenNow) {
      trapFocus(photoModal, event);
    } else if (modalOpenNow && modalDialog) {
      trapFocus(modalDialog, event);
    }
    return;
  }

  if (!modalOpenNow || event.target instanceof HTMLVideoElement) {
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
