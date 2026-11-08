-- Read every licence and ID upload again with the closer rules (unreadable names, reading slips, part numbers,
-- the photo on their other document), so cards that only needed those close on their own. Orb-applied files and the
-- saved GOV.UK / manual check pages keep their read.
UPDATE documents d SET ai_read_key = NULL
  FROM officers o
 WHERE o.id = d.owner_id AND d.owner_type = 'officer' AND o.status IN ('active', 'onboarding')
   AND d.kind IN ('sia', 'rtw', 'id') AND d.s3_key IS NOT NULL AND d.auto_applied_at IS NULL
   AND d.id IS DISTINCT FROM o.rtw_check_doc
   AND d.title NOT IN ('GOV.UK right to work check', 'Right to work — manual check');
