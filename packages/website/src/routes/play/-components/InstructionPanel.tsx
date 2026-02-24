import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DEFAULT_RUNTIME_KEYBINDINGS,
  type RebindableActionId,
  type RuntimeKeybindings,
  RUNTIME_KEYBINDINGS_UPDATED_EVENT,
  findBindingConflict,
  formatBindingForDisplay,
  isReservedBinding,
  loadRuntimeKeybindings,
  normalizeCapturedKey,
  resetRuntimeKeybindings,
  saveRuntimeKeybindings,
} from "@shared/util/runtime-keybindings";

interface InstructionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type EditableRow = {
  label: string;
  actionId: RebindableActionId;
  suffix?: string;
};

type FixedRow = {
  label: string;
  value: string;
};

const MOVEMENT_ROWS: EditableRow[] = [
  { label: "Move Up", actionId: "moveUp" },
  { label: "Move Left", actionId: "moveLeft" },
  { label: "Move Down", actionId: "moveDown" },
  { label: "Move Right", actionId: "moveRight" },
  { label: "Sprint", actionId: "sprint" },
];

const COMBAT_ROWS: FixedRow[] = [{ label: "Fire Weapon", value: "LEFT CLICK" }];

const ACTION_ROWS: EditableRow[] = [
  { label: "Interact", actionId: "interact" },
  { label: "Teleport to Base", actionId: "teleportToBase", suffix: " (Hold)" },
  { label: "Quick Heal", actionId: "quickHeal" },
  { label: "Drop Item", actionId: "dropItem" },
  { label: "Split Drop Item", actionId: "splitDropItem" },
  { label: "Weapons HUD", actionId: "weaponsHud" },
  { label: "Quick Switch Weapon", actionId: "quickSwitchWeapon" },
];

const INTERFACE_EDITABLE_ROWS: EditableRow[] = [
  { label: "Chat", actionId: "chat" },
  { label: "Player List", actionId: "playerList" },
  { label: "Controls", actionId: "controlsPanel" },
];

const INTERFACE_FIXED_ROWS: FixedRow[] = [
  { label: "Map", value: "M" },
  { label: "Mute Sound", value: "N" },
];

const ACTION_LABELS: Record<RebindableActionId, string> = {
  moveUp: "Move Up",
  moveLeft: "Move Left",
  moveDown: "Move Down",
  moveRight: "Move Right",
  sprint: "Sprint",
  interact: "Interact",
  teleportToBase: "Teleport to Base",
  quickHeal: "Quick Heal",
  dropItem: "Drop Item",
  splitDropItem: "Split Drop Item",
  weaponsHud: "Weapons HUD",
  quickSwitchWeapon: "Quick Switch Weapon",
  chat: "Chat",
  playerList: "Player List",
  controlsPanel: "Controls",
};

function EditableBindingRow({
  row,
  bindings,
  listeningActionId,
  onStartListening,
}: {
  row: EditableRow;
  bindings: RuntimeKeybindings;
  listeningActionId: RebindableActionId | null;
  onStartListening: (actionId: RebindableActionId) => void;
}) {
  const isListening = listeningActionId === row.actionId;
  const bindingText = isListening
    ? "PRESS KEY..."
    : `${formatBindingForDisplay(bindings[row.actionId])}${row.suffix ?? ""}`;

  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-gray-300">{row.label}:</span>
      <button
        type="button"
        onClick={() => onStartListening(row.actionId)}
        className={`font-mono text-xs sm:text-sm rounded border px-2 py-1 transition-colors ${
          isListening
            ? "border-yellow-400 text-yellow-300 bg-yellow-400/10"
            : "border-gray-600 text-white bg-gray-800 hover:bg-gray-700 hover:border-gray-500"
        }`}
        aria-pressed={isListening}
      >
        {bindingText}
      </button>
    </div>
  );
}

function FixedBindingRow({ row }: { row: FixedRow }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-300">{row.label}:</span>
      <span className="font-mono">{row.value}</span>
    </div>
  );
}

/**
 * Panel displaying game controls and instructions
 */
export function InstructionPanel({ isOpen, onClose }: InstructionPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [bindings, setBindings] = useState<RuntimeKeybindings>(DEFAULT_RUNTIME_KEYBINDINGS);
  const [listeningActionId, setListeningActionId] = useState<RebindableActionId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setListeningActionId(null);
      setErrorMessage(null);
      return;
    }
    setBindings(loadRuntimeKeybindings());
  }, [isOpen]);

  useEffect(() => {
    const syncBindings = () => {
      setBindings(loadRuntimeKeybindings());
    };

    window.addEventListener(RUNTIME_KEYBINDINGS_UPDATED_EVENT, syncBindings as EventListener);
    return () => {
      window.removeEventListener(RUNTIME_KEYBINDINGS_UPDATED_EVENT, syncBindings as EventListener);
    };
  }, []);

  // Capture reassignment keys before the game client or page-level listeners see them.
  useEffect(() => {
    if (!isOpen || !listeningActionId) return;

    const handleCaptureKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === "Escape") {
        setListeningActionId(null);
        setErrorMessage(null);
        return;
      }

      const candidate = normalizeCapturedKey(e);
      if (!candidate) {
        setErrorMessage("That key is not supported. Try a standard keyboard key.");
        return;
      }

      if (isReservedBinding(candidate)) {
        setErrorMessage("That key is reserved (Escape, number keys, and M cannot be rebound).");
        return;
      }

      const conflict = findBindingConflict(bindings, listeningActionId, candidate);
      if (conflict) {
        setErrorMessage(
          `${ACTION_LABELS[conflict]} already uses ${formatBindingForDisplay(candidate)}.`
        );
        return;
      }

      const next = saveRuntimeKeybindings({
        ...bindings,
        [listeningActionId]: candidate,
      });
      setBindings(next);
      setListeningActionId(null);
      setErrorMessage(null);
    };

    window.addEventListener("keydown", handleCaptureKey, true);
    return () => {
      window.removeEventListener("keydown", handleCaptureKey, true);
    };
  }, [bindings, isOpen, listeningActionId]);

  // Handle ESC key to close (unless currently rebinding a key).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !listeningActionId) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, listeningActionId, onClose]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed left-4 top-20 z-[9999]">
      <div
        ref={panelRef}
        className="bg-gray-900 opacity-100 border border-gray-700 rounded-lg p-6 shadow-xl max-w-2xl w-full"
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-white font-bold text-2xl">Game Controls</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-gray-600 bg-gray-800 text-white hover:bg-gray-700"
              onClick={() => {
                const next = resetRuntimeKeybindings();
                setBindings(next);
                setListeningActionId(null);
                setErrorMessage(null);
              }}
            >
              Reset to Defaults
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-white">
          <div className="space-y-3">
            <h3 className="font-semibold text-lg text-blue-400 mb-2">Movement</h3>
            <div className="space-y-2 text-sm">
              {MOVEMENT_ROWS.map((row) => (
                <EditableBindingRow
                  key={row.actionId}
                  row={row}
                  bindings={bindings}
                  listeningActionId={listeningActionId}
                  onStartListening={(actionId) => {
                    setListeningActionId(actionId);
                    setErrorMessage(null);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg text-blue-400 mb-2">Combat</h3>
            <div className="space-y-2 text-sm">
              {COMBAT_ROWS.map((row) => (
                <FixedBindingRow key={row.label} row={row} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg text-blue-400 mb-2">Actions</h3>
            <div className="space-y-2 text-sm">
              {ACTION_ROWS.map((row) => (
                <EditableBindingRow
                  key={row.actionId}
                  row={row}
                  bindings={bindings}
                  listeningActionId={listeningActionId}
                  onStartListening={(actionId) => {
                    setListeningActionId(actionId);
                    setErrorMessage(null);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg text-blue-400 mb-2">Interface</h3>
            <div className="space-y-2 text-sm">
              {INTERFACE_EDITABLE_ROWS.map((row) => (
                <EditableBindingRow
                  key={row.actionId}
                  row={row}
                  bindings={bindings}
                  listeningActionId={listeningActionId}
                  onStartListening={(actionId) => {
                    setListeningActionId(actionId);
                    setErrorMessage(null);
                  }}
                />
              ))}
              {INTERFACE_FIXED_ROWS.map((row) => (
                <FixedBindingRow key={row.label} row={row} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 text-xs text-gray-400">
          <p>Click a key to rebind it. Press Esc while rebinding to cancel.</p>
          <p>Reserved: Esc, number keys (0-9), and M.</p>
          {errorMessage && <p className="text-red-400 mt-2">{errorMessage}</p>}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 text-center">
            Press <span className="font-mono text-white">ESC</span> or click the close button to
            return to the game
          </p>
        </div>
      </div>
    </div>
  );
}
