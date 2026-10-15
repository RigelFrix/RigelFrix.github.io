/*
  The play world. Each entry is something Niko can walk up to.

  kind     built-in look: monolith, hut, skills, milestones, mailbox, lectern
  u, v     position on the island in screen terms: u runs right, v runs toward the camera (see world-map.js).
           x, z (world axes) also work.
  faceTo   [u, v] the front turns toward, so each stop faces what is around it (a fire, a plaza, a path)
  facing   or a fixed direction in degrees (0 faces +z; 45 faces the camera)
  lean     optional sideways tilt in degrees, for weathered stones
  action   what opens on arrival:
             { type: "project", project: "<id from gallery-data.js>" }
             { type: "section", section: "<section id in index.html>" }
             { type: "link", href: "...", text: "Button label" }
  model    optional .glb file that replaces the built-in look, e.g. "./assets/models/desk.glb"
  scale    optional size multiplier for the model
  radius   optional collision radius
*/

(() => {
  /* Cliffside: the games stand in an arc of shrine tablets along the back of a paved plaza, each turned toward
     its middle, so the open side faces the bridge and the viewer */
  const plaza = [13.2, -8];
  const ring = (deg) => {
    const a = (deg * Math.PI) / 180;
    return { u: plaza[0] + Math.cos(a) * 4.3, v: plaza[1] + Math.sin(a) * 3, faceTo: plaza, scale: 0.9 };
  };

  window.WORLD_OBJECTS = [
    { id: "cab-dijoker", label: "DiJoker", kind: "monolith", ...ring(-165), lean: -2, action: { type: "project", project: "dijoker" } },
    { id: "cab-troublefixit", label: "TroubleFixIt", kind: "monolith", ...ring(-135), lean: 1.5, action: { type: "project", project: "troublefixit" } },
    { id: "cab-disaster", label: "Disaster Game", kind: "monolith", ...ring(-105), lean: 3, action: { type: "project", project: "disaster" } },
    { id: "cab-pcbuilding", label: "Build2Connect", kind: "monolith", ...ring(-75), lean: -1.5, action: { type: "project", project: "pcbuilding" } },
    { id: "cab-basketball3d", label: "3D Basketball", kind: "monolith", ...ring(-45), lean: 2, action: { type: "project", project: "basketball3d" } },
    { id: "cab-prototypelab", label: "Prototype Lab", kind: "monolith", ...ring(-15), lean: -3, action: { type: "project", project: "prototypelab" } },

    /* Upper plateau camp: the tent and the move list turn in toward the campfire clearing */
    { id: "about", label: "About me", kind: "hut", u: -12.8, v: -7.4, faceTo: [-9.8, -4.6], action: { type: "section", section: "player" } },
    { id: "skills", label: "Skills", kind: "skills", u: -6.9, v: -7, faceTo: [-9.4, -3.8], action: { type: "section", section: "moves" } },

    /* Ruins path: the career stones line the path up to the shrine */
    { id: "career", label: "Career", kind: "milestones", u: 3.8, v: -8.4, faceTo: [2.4, -5.6], action: { type: "section", section: "career" } },

    /* Beach and dock: the mailbox stands at one end of the dock's T-head, turned toward the junction */
    { id: "contact", label: "Contact", kind: "mailbox", u: -18.4, v: 19.6, faceTo: [-19.6, 17.8], action: { type: "section", section: "contact" } },

    /* Star Shrine: the resume rests on a lectern that faces the dais */
    {
      id: "resume",
      label: "Resume",
      kind: "lectern",
      u: -5.2,
      v: -13.2,
      faceTo: [-1, -14.4],
      action: { type: "link", href: "./assets/Francis-Yambao-Resume.pdf", text: "Open resume (PDF)" },
    },
  ];
})();
