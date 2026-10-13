/*
  The play world. Each entry is something the robot can walk up to.

  kind     built-in look: cabinet, desk, skills, signpost, mailbox, board, lamp, crate
  x, z     position on the floor (the floor runs from -16 to 16 on both axes)
  facing   direction the front faces, in degrees (0 faces the camera side, +z)
  action   what opens on arrival:
             { type: "project", project: "<id from gallery-data.js>" }
             { type: "section", section: "<section id in index.html>" }
             { type: "link", href: "...", text: "Button label" }
  model    optional .glb file that replaces the built-in look, e.g. "./assets/models/desk.glb"
  scale    optional size multiplier for the model
  radius   optional collision radius
*/

window.WORLD_OBJECTS = [
  { id: "cab-dijoker", label: "DiJoker", kind: "cabinet", x: -7.5, z: -9, facing: 0, action: { type: "project", project: "dijoker" } },
  { id: "cab-troublefixit", label: "TroubleFixIt", kind: "cabinet", x: -4.5, z: -9.6, facing: 0, action: { type: "project", project: "troublefixit" } },
  { id: "cab-disaster", label: "Disaster Game", kind: "cabinet", x: -1.5, z: -10, facing: 0, action: { type: "project", project: "disaster" } },
  { id: "cab-pcbuilding", label: "Build2Connect", kind: "cabinet", x: 1.5, z: -10, facing: 0, action: { type: "project", project: "pcbuilding" } },
  { id: "cab-basketball3d", label: "3D Basketball", kind: "cabinet", x: 4.5, z: -9.6, facing: 0, action: { type: "project", project: "basketball3d" } },
  { id: "cab-prototypelab", label: "Prototype Lab", kind: "cabinet", x: 7.5, z: -9, facing: 0, action: { type: "project", project: "prototypelab" } },

  { id: "about", label: "About me", kind: "desk", x: -10.5, z: 0.5, facing: 90, action: { type: "section", section: "player" } },
  { id: "skills", label: "Skills", kind: "skills", x: 10.5, z: -1.5, facing: 0, action: { type: "section", section: "moves" } },
  { id: "career", label: "Career", kind: "signpost", x: -7, z: 9, facing: 30, action: { type: "section", section: "career" } },
  { id: "contact", label: "Contact", kind: "mailbox", x: 4.5, z: 9.5, facing: 15, action: { type: "section", section: "contact" } },
  {
    id: "resume",
    label: "Resume",
    kind: "board",
    x: 10,
    z: 6.5,
    facing: 30,
    action: { type: "link", href: "./assets/Francis-Yambao-Resume.pdf", text: "Open resume (PDF)" },
  },

  { id: "lamp-1", kind: "lamp", x: -13.5, z: -13.5 },
  { id: "lamp-2", kind: "lamp", x: 13.5, z: -13.5 },
  { id: "lamp-3", kind: "lamp", x: -13.5, z: 13.5 },
  { id: "lamp-4", kind: "lamp", x: 13.5, z: 13.5 },
  { id: "crate-1", kind: "crate", x: -12.5, z: -5.5, facing: 20 },
  { id: "crate-2", kind: "crate", x: -11.6, z: -6.6, facing: -10, scale: 0.7 },
  { id: "crate-3", kind: "crate", x: 12.4, z: -6, facing: 35 },
  { id: "crate-4", kind: "crate", x: 1.5, z: 13, facing: 15, scale: 0.8 },
];
