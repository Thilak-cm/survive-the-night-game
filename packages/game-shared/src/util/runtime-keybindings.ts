export type RebindableActionId =
  | "moveUp"
  | "moveLeft"
  | "moveDown"
  | "moveRight"
  | "sprint"
  | "interact"
  | "teleportToBase"
  | "quickHeal"
  | "dropItem"
  | "splitDropItem"
  | "weaponsHud"
  | "quickSwitchWeapon"
  | "chat"
  | "playerList"
  | "controlsPanel";

export type BindingToken = string;

export type RuntimeKeybindings = Record<RebindableActionId, BindingToken>;

export const RUNTIME_KEYBINDINGS_STORAGE_KEY = "stn_custom_keybindings_v1";
export const RUNTIME_KEYBINDINGS_UPDATED_EVENT = "stn:keybindings-updated";

export const DEFAULT_RUNTIME_KEYBINDINGS: RuntimeKeybindings = {
  moveUp: "KeyW",
  moveLeft: "KeyA",
  moveDown: "KeyS",
  moveRight: "KeyD",
  sprint: "Shift",
  interact: "KeyE",
  teleportToBase: "KeyC",
  quickHeal: "KeyH",
  dropItem: "KeyG",
  splitDropItem: "KeyX",
  weaponsHud: "KeyF",
  quickSwitchWeapon: "KeyQ",
  chat: "KeyY",
  playerList: "Tab",
  controlsPanel: "KeyI",
};

const REBINDABLE_ACTION_IDS = Object.keys(DEFAULT_RUNTIME_KEYBINDINGS) as RebindableActionId[];

const RESERVED_CODES = new Set<string>([
  "Escape",
  "KeyM",
  "Digit0",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Numpad0",
  "Numpad1",
  "Numpad2",
  "Numpad3",
  "Numpad4",
  "Numpad5",
  "Numpad6",
  "Numpad7",
  "Numpad8",
  "Numpad9",
]);

const CANONICAL_ALIASES: Record<string, BindingToken> = {
  shiftleft: "Shift",
  shiftright: "Shift",
  shift: "Shift",
  controlleft: "Control",
  controlright: "Control",
  control: "Control",
  ctrl: "Control",
  altleft: "Alt",
  altright: "Alt",
  alt: "Alt",
  metaleft: "Meta",
  metaright: "Meta",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
  enter: "Enter",
  tab: "Tab",
  space: "Space",
  " ": "Space",
  escape: "Escape",
  esc: "Escape",
};

export function getBindingEventCodes(token: BindingToken): string[] {
  switch (token) {
    case "Shift":
      return ["ShiftLeft", "ShiftRight"];
    case "Control":
      return ["ControlLeft", "ControlRight"];
    case "Alt":
      return ["AltLeft", "AltRight"];
    case "Meta":
      return ["MetaLeft", "MetaRight"];
    default:
      return [token];
  }
}

export function matchesBinding(event: KeyboardEvent, token: BindingToken): boolean {
  const codes = getBindingEventCodes(token);
  return codes.includes(event.code);
}

export function normalizeBindingToken(token: string): BindingToken | null {
  if (!token || typeof token !== "string") return null;
  const raw = token.trim();
  if (!raw) return null;

  const alias = CANONICAL_ALIASES[raw.toLowerCase()];
  if (alias) return alias;

  if (/^Key[A-Z]$/.test(raw)) return raw;
  if (/^Digit[0-9]$/.test(raw)) return raw;
  if (/^Numpad[0-9]$/.test(raw)) return raw;
  if (/^Arrow(Up|Down|Left|Right)$/.test(raw)) return raw;
  if (/^(Enter|Tab|Space|Backspace|Delete|Home|End|PageUp|PageDown|Insert)$/.test(raw)) {
    return raw;
  }
  if (/^Bracket(Left|Right)$/.test(raw)) return raw;
  if (/^(Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote)$/.test(raw)) {
    return raw;
  }

  return null;
}

export function normalizeCapturedKey(event: KeyboardEvent): BindingToken | null {
  if (!event.code || event.code === "Unidentified") return null;
  return normalizeBindingToken(event.code);
}

export function isReservedBinding(token: BindingToken): boolean {
  return getBindingEventCodes(token).some((code) => RESERVED_CODES.has(code));
}

export function findBindingConflict(
  bindings: RuntimeKeybindings,
  actionId: RebindableActionId,
  candidate: BindingToken
): RebindableActionId | null {
  for (const id of REBINDABLE_ACTION_IDS) {
    if (id === actionId) continue;
    if (bindings[id] === candidate) return id;
  }
  return null;
}

function sanitizeBindings(value: unknown): RuntimeKeybindings {
  const sanitized: RuntimeKeybindings = { ...DEFAULT_RUNTIME_KEYBINDINGS };
  if (!value || typeof value !== "object") return sanitized;

  const seen = new Set<BindingToken>();

  for (const actionId of REBINDABLE_ACTION_IDS) {
    const current = sanitized[actionId];
    if (!isReservedBinding(current)) {
      seen.add(current);
    }
  }

  const record = value as Record<string, unknown>;
  for (const actionId of REBINDABLE_ACTION_IDS) {
    const raw = record[actionId];
    if (typeof raw !== "string") continue;

    const normalized = normalizeBindingToken(raw);
    if (!normalized) continue;
    if (isReservedBinding(normalized)) continue;

    const previousDefault = sanitized[actionId];
    const nextSeen = new Set(seen);
    nextSeen.delete(previousDefault);
    if (nextSeen.has(normalized)) continue;

    seen.delete(previousDefault);
    sanitized[actionId] = normalized;
    seen.add(normalized);
  }

  return sanitized;
}

function emitBindingsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RUNTIME_KEYBINDINGS_UPDATED_EVENT));
}

function toConfigLabel(token: BindingToken): string {
  return formatBindingForDisplay(token).toLowerCase();
}

export function syncSharedKeybindingDisplayConfig(bindings: RuntimeKeybindings): void {
  if (typeof window === "undefined") return;
  const keybindings = (window as any).config?.keybindings as Record<string, string> | undefined;
  if (!keybindings) return;

  keybindings.INTERACT = toConfigLabel(bindings.interact);
  keybindings.DROP = toConfigLabel(bindings.dropItem);
  keybindings.QUICK_HEAL = toConfigLabel(bindings.quickHeal);
  keybindings.SPRINT = toConfigLabel(bindings.sprint);
  keybindings.CHAT = toConfigLabel(bindings.chat);
  keybindings.PLAYER_LIST = toConfigLabel(bindings.playerList);
  keybindings.WEAPONS_HUD = toConfigLabel(bindings.weaponsHud);
  keybindings.QUICK_SWITCH = toConfigLabel(bindings.quickSwitchWeapon);
  keybindings.TOGGLE_INSTRUCTIONS = toConfigLabel(bindings.controlsPanel);
  // Mute is currently hardcoded to N in InputManager and not rebindable in this pass.
  keybindings.TOGGLE_MUTE = "n";
}

export function loadRuntimeKeybindings(): RuntimeKeybindings {
  const defaults = { ...DEFAULT_RUNTIME_KEYBINDINGS };

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_KEYBINDINGS_STORAGE_KEY);
    if (!raw) {
      syncSharedKeybindingDisplayConfig(defaults);
      return defaults;
    }

    const parsed = JSON.parse(raw);
    const sanitized = sanitizeBindings(parsed);
    syncSharedKeybindingDisplayConfig(sanitized);
    return sanitized;
  } catch {
    syncSharedKeybindingDisplayConfig(defaults);
    return defaults;
  }
}

export function saveRuntimeKeybindings(bindings: RuntimeKeybindings): RuntimeKeybindings {
  const sanitized = sanitizeBindings(bindings);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RUNTIME_KEYBINDINGS_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore storage failures (private browsing / quota / disabled storage).
    }
    syncSharedKeybindingDisplayConfig(sanitized);
    emitBindingsUpdated();
  }

  return sanitized;
}

export function resetRuntimeKeybindings(): RuntimeKeybindings {
  return saveRuntimeKeybindings({ ...DEFAULT_RUNTIME_KEYBINDINGS });
}

export function formatBindingForDisplay(token: BindingToken): string {
  const matchers: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^Key([A-Z])$/, (m) => m[1]],
    [/^Digit([0-9])$/, (m) => m[1]],
    [/^Numpad([0-9])$/, (m) => `NUM ${m[1]}`],
  ];

  for (const [pattern, formatter] of matchers) {
    const match = token.match(pattern);
    if (match) return formatter(match).toUpperCase();
  }

  const specialLabels: Record<string, string> = {
    Shift: "SHIFT",
    Control: "CTRL",
    Alt: "ALT",
    Meta: "CMD",
    Enter: "ENTER",
    Tab: "TAB",
    Space: "SPACE",
    Backspace: "BACKSPACE",
    Delete: "DELETE",
    Home: "HOME",
    End: "END",
    PageUp: "PAGE UP",
    PageDown: "PAGE DOWN",
    Insert: "INSERT",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
  };

  if (specialLabels[token]) return specialLabels[token];

  return token.toUpperCase();
}
