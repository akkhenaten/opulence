import { useState } from 'react';
import { Camera, MapPin, Nfc, QrCode, ScanFace, Smartphone } from 'lucide-react';
import { Avatar, cx, Lightbox, Pressable } from '../../ui/index.jsx';

// Clock-in proof shown to managers: which checks passed, and the selfie beside the profile photo
export const FACE = {
  match: { label: 'Face matches', tone: 'bg-green-soft text-green' },
  unsure: { label: 'Face unclear', tone: 'bg-amber-soft text-amber' },
  no_match: { label: 'Face may not match', tone: 'bg-red-soft text-red' },
  unscored: { label: 'Face not checked', tone: 'bg-fill text-muted' },
};

export function Flag({ ok, icon: Icon, children, tone }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold', tone || (ok ? 'bg-green-soft text-green' : 'bg-red-soft text-red'))}>
      <Icon size={14} />{children}
    </span>
  );
}

// Old clock events (before phone checks) have device_ok null: say nothing rather than "failed"
export function ProofFlags({ e }) {
  const isIn = e.kind === 'in';
  const fl = e.flags || [];
  return (
    <>
      {(e.kind === 'in' || e.kind === 'out') && e.device_ok != null && (
        <Flag ok={e.device_ok} tone={fl.includes('new_phone') ? 'bg-amber-soft text-amber' : undefined} icon={Smartphone}>
          {e.device_ok ? 'Phone ok' : fl.includes('new_phone') ? 'New phone, not approved' : 'Phone not checked'}
        </Flag>
      )}
      {(e.kind === 'in' || e.kind === 'out') && (
        <Flag ok={e.geo_ok} icon={MapPin}>
          {e.distance_m == null ? 'No location' : <span className="num">{Math.round(e.distance_m)}m away{e.radius_m ? ` · limit ${e.radius_m}m` : ''}</span>}
        </Flag>
      )}
      {isIn && (e.venue_code === 'nfc'
        ? <Flag ok icon={Nfc}>NFC tag{e.tag_label ? ` · ${e.tag_label}` : ''}</Flag>
        : <Flag ok={e.qr_ok} icon={QrCode}>{e.qr_ok ? 'QR ok' : e.proof_rule ? 'No venue code' : 'QR failed'}</Flag>)}
      {isIn && e.proof_rule && <Flag ok={!!e.has_selfie || !!e.selfie_url} tone={e.has_selfie || e.selfie_url ? undefined : 'bg-fill text-muted'} icon={Camera}>{e.has_selfie || e.selfie_url ? 'Selfie' : 'No selfie'}</Flag>}
      {isIn && e.face_result && <Flag tone={FACE[e.face_result]?.tone} icon={ScanFace}>{FACE[e.face_result]?.label}</Flag>}
      {fl.includes('rule_not_met') && <Flag icon={MapPin} tone="bg-amber-soft text-amber">Not enough checks</Flag>}
    </>
  );
}

// Profile photo and clock-in selfie side by side; tap to enlarge
export function SelfieCompare({ e, size = 72 }) {
  const [open, setOpen] = useState(null);
  if (!e.selfie_url) return null;
  const photos = [{ url: e.selfie_url, name: 'Clock-in selfie' }, ...(e.profile_photo_url ? [{ url: e.profile_photo_url, name: 'Profile photo' }] : [])];
  const pic = (p, i, label) => (
    <Pressable key={label} onClick={() => setOpen(i)} className="flex flex-col items-center gap-1" aria-label={`Open ${label.toLowerCase()}`}>
      <img src={p.url} alt={label} className="rounded-2xl object-cover shadow-tile" style={{ width: size, height: size }} />
      <span className="text-caption2 font-semibold text-muted">{label}</span>
    </Pressable>
  );
  return (
    <div className="flex items-start gap-3">
      {e.profile_photo_url ? pic(photos[1], 1, 'Profile') : (
        <div className="flex flex-col items-center gap-1"><Avatar name={e.officer_name} size={size} /><span className="text-caption2 font-semibold text-muted">No photo</span></div>
      )}
      {pic(photos[0], 0, 'Selfie')}
      {e.face_note && <p className="min-w-0 flex-1 self-center text-footnote text-muted">{e.face_note}</p>}
      <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} />
    </div>
  );
}
