import { useState } from "react";
import { store, useDB } from "../data/store";
import { appUrl, encodePayload, type ScoresPayload } from "../data/share";
import type { Student } from "../data/model";
import { Icon, Sheet } from "../components/ui";

/**
 * For a student practicing at home: packs the games played since the last send
 * into a link they paste into a message to their teacher.
 */
export function SendScores({ student }: { student: Student }) {
  const db = useDB((d) => d);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const lastSent = db.settings.lastSentAt?.[student.id] ?? "";
  const unsent = db.sessions.filter((s) => s.studentId === student.id && s.startedAt > lastSent);

  const build = async () => {
    // Everything new since the last send; if never sent, the most recent 60 games.
    const sessions = (lastSent ? unsent : db.sessions.filter((s) => s.studentId === student.id)).slice(-60);
    const payload: ScoresPayload = {
      kind: "scores",
      v: 1,
      student: { id: student.id, name: student.name, color: student.color },
      sessions,
      sentAt: new Date().toISOString(),
    };
    const url = appUrl(`/import/${await encodePayload(payload)}`);
    setLink(url);
    setCopied(false);
    setOpen(true);
  };

  const markSent = () => store.updateSettings({ lastSentAt: { ...db.settings.lastSentAt, [student.id]: new Date().toISOString() } });

  const share = async () => {
    const text = `${student.name}'s practice scores from Bravissimo`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url: link });
        markSent();
        setOpen(false);
        return;
      }
    } catch {
      return; // the share sheet was dismissed
    }
    await copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      markSent();
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="card pad spread">
        <div className="grow">
          <h3>Send your scores to {db.settings.teacherName}</h3>
          <p className="muted small">
            {unsent.length
              ? `${unsent.length} game${unsent.length > 1 ? "s" : ""} not sent yet.`
              : lastSent
                ? "Everything's been sent. Nice work!"
                : "Share a link in your lesson messages."}
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={build} disabled={!unsent.length}>
          <Icon name="share" size={18} /> Send scores
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Send your scores">
        <p className="muted">Send this link to {db.settings.teacherName} (paste it into your lesson messages). Opening it adds your games to the studio records.</p>
        <div className="link-box">
          <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Scores link" />
        </div>
        <div className="btn-row">
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="btn btn-primary" type="button" onClick={share}>
              <Icon name="share" size={18} /> Share
            </button>
          )}
          <button className="btn" type="button" onClick={copy}>
            {copied ? (
              <>
                <Icon name="check" size={18} /> Copied
              </>
            ) : (
              "Copy link"
            )}
          </button>
        </div>
      </Sheet>
    </>
  );
}
