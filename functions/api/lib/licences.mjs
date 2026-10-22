// UK SIA licence types and officer document kinds (match the app's pickers)
export const SIA_TYPES = ['Door Supervisor', 'Security Guarding', 'CCTV (Public Space Surveillance)', 'Close Protection',
  'Cash and Valuables in Transit', 'Key Holding', 'Vehicle Immobilising'];
export const DOC_KINDS = ['sia', 'rtw', 'id', 'poa', 'training', 'first_aid', 'cctv', 'contract', 'other'];
export const DOC_LABEL = { sia: 'SIA licence', rtw: 'right to work', id: 'photo ID', poa: 'proof of address', training: 'training certificate', first_aid: 'first aid certificate', cctv: 'CCTV certificate', contract: 'contract', other: 'document' };
// Outside certificates shown on Training (expiry-tracked; refreshers due)
export const TRAINING_KINDS = ['first_aid', 'cctv', 'training'];
