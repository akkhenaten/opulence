-- Orb applies an uploaded SIA card or British/Irish passport to the profile when everything on it agrees
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auto_applied_at timestamptz;

-- Read the latest unchecked licence and ID uploads again with the new rules (initials with proof, photo, passports),
-- so people who already uploaded go green without uploading again
UPDATE documents SET ai_read_key = NULL
 WHERE id IN (
   SELECT DISTINCT ON (d.owner_id, d.kind) d.id
     FROM documents d JOIN officers o ON o.id = d.owner_id
    WHERE d.owner_type = 'officer' AND d.kind IN ('sia', 'rtw', 'id') AND d.s3_key IS NOT NULL
      AND o.status IN ('active', 'onboarding')
    ORDER BY d.owner_id, d.kind, d.created_at DESC)
   AND verified_at IS NULL;
