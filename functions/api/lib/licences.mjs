// UK SIA licence types and officer document kinds (match the app's pickers)
export const SIA_TYPES = ['Door Supervisor', 'Security Guarding', 'CCTV (Public Space Surveillance)', 'Close Protection',
  'Cash and Valuables in Transit', 'Key Holding', 'Vehicle Immobilising'];
export const DOC_KINDS = ['sia', 'rtw', 'id', 'poa', 'training', 'first_aid', 'cctv', 'contract', 'cv', 'other'];
export const DOC_LABEL = { sia: 'SIA licence', rtw: 'right to work', id: 'photo ID', poa: 'proof of address', training: 'training certificate', first_aid: 'first aid certificate', cctv: 'CCTV certificate', contract: 'contract', cv: 'CV', other: 'document' };
// Roles offered on the public Apply page (codes in the roles table)
export const APPLY_ROLES = ['door', 'guard', 'cctv', 'steward', 'close'];
// Outside certificates shown on Training (expiry-tracked; refreshers due)
export const TRAINING_KINDS = ['first_aid', 'cctv', 'training'];
