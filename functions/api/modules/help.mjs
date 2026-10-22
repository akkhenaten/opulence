import { Doc } from '../lib/pdf.mjs';
import { guideFor } from '../lib/guide.mjs';
import { getSettings } from './settings.mjs';
import { ALL, def } from './_def.mjs';

const ROLE_LABEL = { company: 'Company managers', security: 'Security managers', venue: 'Venue managers', officer: 'Officers' };

// One paragraph of guide text: plain lines, "- " bullets and "1. " steps get a hanging indent
function paragraph(d, para) {
  for (const line of para.split('\n')) {
    const m = line.match(/^(- |\d+\. )(.*)$/);
    if (!m) { d.text(line, { size: 10 }); continue; }
    const y = d.y;
    d.text(m[1] === '- ' ? '-' : m[1].trim(), { size: 10, x: d.x + 6, maxWidth: 16, gap: 0 });
    d.y = y;
    d.text(m[2], { size: 10, x: d.x + 22, maxWidth: d.w - 22 });
  }
  d.space(6);
}

export const actions = {
  'help.guide': def(ALL, async (b, { user }) => {
    const s = await getSettings();
    return { role: user.role, chapters: guideFor(user.role, s.company_name) };
  }),

  'help.pdf': def(ALL, async (b, { user }) => {
    const s = await getSettings();
    const chapters = guideFor(user.role, s.company_name);
    const d = await Doc.create('User guide');
    await d.header(s, 'User guide', `For ${ROLE_LABEL[user.role] || 'everyone'}`);
    d.section('Contents');
    chapters.forEach((c, i) => d.text(`${i + 1}. ${c.title}`, { size: 10 }));
    d.space(4);
    d.text('Screenshots and search are in the app: open Help & user guide from your account menu.', { size: 9 });
    chapters.forEach((c, i) => {
      d.addPage();
      d.text(`${i + 1}. ${c.title}`, { size: 16, font: d.bold, gap: 10 });
      for (const sec of c.sections) {
        d.section(sec.title);
        sec.body.split(/\n\s*\n/).forEach((p) => paragraph(d, p.trim()));
      }
    });
    const slug = (s.company_name || 'orb').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return { filename: `${slug}-user-guide.pdf`, pdf: await d.base64() };
  }),
};
