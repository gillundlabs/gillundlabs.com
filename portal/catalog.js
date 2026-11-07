/* Public allow-list for the testing bench.
   Package bytes and zip seals stay off this repository.
   A slot with approval "pending" cannot be served, even if a file is uploaded. */

export const REFUSED_PACKAGE_IDS = Object.freeze([
  'vm-test-full-841142a6a1',
]);

const REFUSED = new Set(REFUSED_PACKAGE_IDS);

export const SLOTS = Object.freeze([
  {
    id: 'maxwells-demon',
    title: "Maxwell's Demon",
    kind: 'full',
    approval: 'accepted',
    packageId: 'md-test-36ec3cdea1',
    shot: '/games/maxwells-demon/shots/desktop-victorian-01-title.jpg',
    icon: '/assets/img/maxwells-demon-icon.png',
    shotAlt: "Maxwell's Demon title card",
  },
  {
    id: 'vacuum-maze',
    title: 'Vacuum Maze',
    kind: 'full',
    approval: 'accepted',
    packageId: 'vm-test-full-a4a51186fe',
    shot: '/games/vacuum-maze/shots/01-title.jpg',
    icon: '/assets/img/vacuum-maze-icon.png',
    shotAlt: 'Vacuum Maze title card',
  },
  {
    id: 'fantastic-apparatus',
    title: 'Fantastic Apparatus',
    kind: 'full',
    approval: 'accepted',
    packageId: 'fa-standard-full-v1-4322acb',
    shot: '/games/fantastic-apparatus/shots/running-desktop-victorian.jpg',
    icon: '/assets/img/fantastic-apparatus-icon.png',
    shotAlt: 'Fantastic Apparatus on the bench',
  },
  {
    id: 'fantastic-apparatus-experimental',
    title: 'Fantastic Apparatus',
    kind: 'experimental',
    approval: 'pending',
    packageId: null,
    reviewId: 'fa-experimental-full-v3-craft-b6a055d',
    shot: '/games/fantastic-apparatus/shots/levels-desktop-victorian.jpg',
    icon: '/assets/img/fantastic-apparatus-icon.png',
    shotAlt: 'Fantastic Apparatus level cards',
  },
]);

export function slotById(id) {
  return SLOTS.find((slot) => slot.id === id) || null;
}

export function isRefusedPackage(packageId) {
  return REFUSED.has(packageId);
}

export function slotStatusCopy(slot, state) {
  if (state === 'ready') {
    return slot.kind === 'experimental'
      ? 'The accepted experimental copy is on this bench.'
      : 'The accepted copy is on this bench.';
  }
  if (slot.approval !== 'accepted' || state === 'pending') {
    if (slot.kind === 'experimental') {
      return `A separate copy with five extra parts. Craft review of ${slot.reviewId} has passed. An independent review of the physics, input, and saved records is still open, so this copy stays closed.`;
    }
    return 'This copy is not on this bench.';
  }
  if (state === 'missing') {
    return `Professor accepted the package ${slot.packageId}. The private copy is not on this host yet, so it cannot be opened.`;
  }
  if (state === 'mismatch') {
    return 'The copy on this host does not match the accepted package, so it stays closed.';
  }
  return `Professor accepted the package ${slot.packageId}. This host has no seal for it yet, so it cannot be opened.`;
}

export function slotKindLabel(slot) {
  if (slot.kind === 'experimental') return 'Experimental';
  return 'Full version';
}

export function slotKindDetail(slot) {
  if (slot.kind === 'experimental') return 'Five extra parts';
  return '';
}
