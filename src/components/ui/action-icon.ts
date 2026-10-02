import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  CheckCheck,
  CircleCheck,
  Download,
  Eraser,
  Eye,
  FolderOpen,
  Gift,
  KeyRound,
  Lock,
  LockOpen,
  LogIn,
  PlayCircle,
  Plus,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Undo2,
  Upload,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * The button standard's icon for an action, by its label's verb ("Save
 * changes" → Save). For buttons whose label is passed in (confirm dialogs,
 * status buttons), so every button shows an icon plus a word.
 * Order matters: the first match wins.
 */
const VERBS: [RegExp, LucideIcon][] = [
  [/^close (cycle|period|month|run)\b/i, Lock],
  [/^(cancel|close|dismiss|reject)\b/i, X],
  [/^(back|keep)\b/i, ArrowLeft],
  [/^(return to draft|undo|revert)\b/i, Undo2],
  [/^(continue|next)\b/i, ArrowRight],
  [/^(save|update)\b/i, Save],
  [/^(add|create|new)\b/i, Plus],
  [/^(delete|remove|move to recycle|discard)\b/i, Trash2],
  [/^(submit|send|release|post|publish)\b/i, Send],
  [/^(approve|confirm|apply|done|got it|ok)\b/i, Check],
  [/^(mark as paid|mark .* paid)\b/i, BadgeCheck],
  [/^(select all|include all)\b/i, CheckCheck],
  [/^(clear|exclude all)\b/i, Eraser],
  [/^(reset two-step|turn off two-step)\b/i, ShieldOff],
  [/^(turn off|disable|deactivate)\b/i, PowerOff],
  [/^(enable|activate|turn on)\b/i, CircleCheck],
  [/^(reset password|change password)\b/i, KeyRound],
  [/^(unlock)\b/i, LockOpen],
  [/^lock\b/i, Lock],
  [/^(open|start|prepare|run)\b/i, PlayCircle],
  [/^(get new|generate|regenerate|refresh|recompute)\b/i, RefreshCw],
  [/^(try again|retry|restore|reset)\b/i, RotateCcw],
  [/^(verify)\b/i, ShieldCheck],
  [/^(grant)\b/i, Gift],
  [/^(assign)\b/i, UserCheck],
  [/^(preview|view|check)\b/i, Eye],
  [/^(upload|import)\b/i, Upload],
  [/^(download|export)\b/i, Download],
  [/^(sign in|log in)\b/i, LogIn],
  [/^(block|ban|suspend)\b/i, Ban],
  [/^(browse|choose)\b/i, FolderOpen],
];

export function iconForAction(label: string): LucideIcon {
  const text = label.trim();
  return VERBS.find(([pattern]) => pattern.test(text))?.[1] ?? Check;
}
