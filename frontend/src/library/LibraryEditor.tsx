import { useState, type FormEvent } from 'react';
import type { LibrarySection, LibrarySource, LibraryTerm, LibraryTopic } from './types';
import { saveLocalTopic } from './localTopics';

function id(value: string, index: number) {
  return `${value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'section'}-${index + 1}`;
}

function parseBody(body: string): LibrarySection[] {
  const sections: LibrarySection[] = [];
  let title = 'Introduction';
  let lines: string[] = [];
  function flush() {
    const blocks = lines.join('\n').split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
    const bullets = blocks.flatMap((block) => block.split('\n').filter((line) => /^[-*]\s+/.test(line)).map((line) => line.replace(/^[-*]\s+/, '').trim()));
    const paragraphs = blocks.map((block) => block.split('\n').filter((line) => !/^[-*]\s+/.test(line)).join(' ').trim()).filter(Boolean);
    if (bullets.length || paragraphs.length) sections.push({ id: id(title, sections.length), title, paragraphs: paragraphs.length ? paragraphs : ['Key points from this section.'], bullets: bullets.length ? bullets : undefined });
    lines = [];
  }
  for (const line of body.split('\n')) {
    const heading = line.match(/^#{2,3}\s+(.+)/);
    if (heading) { flush(); title = heading[1]!.trim(); }
    else lines.push(line);
  }
  flush();
  return sections;
}

function parseTerms(value: string): LibraryTerm[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const split = line.indexOf(':');
    return split > 0 ? { term: line.slice(0, split).trim(), definition: line.slice(split + 1).trim() } : { term: line, definition: 'Definition not supplied.' };
  }).filter((item) => item.term && item.definition).slice(0, 40);
}

function parseSources(value: string): LibrarySource[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [title, rawUrl] = line.split('|').map((part) => part.trim());
    if (!rawUrl) return { title: title! };
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Source URL must start with http:// or https://: ${rawUrl}`);
    return { title: title!, url: url.toString() };
  }).slice(0, 40);
}

export default function LibraryEditor({ onCreated }: { onCreated: (topic: LibraryTopic) => void }) {
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('Research notes');
  const [level, setLevel] = useState<LibraryTopic['level']>('Beginner');
  const [body, setBody] = useState('## Introduction\n\n');
  const [terms, setTerms] = useState('');
  const [sources, setSources] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const sections = parseBody(body);
      if (title.trim().length < 3) throw new Error('Add a title with at least 3 characters.');
      if (summary.trim().length < 20) throw new Error('Add an abstract or summary with at least 20 characters.');
      if (!sections.length || body.trim().length < 80) throw new Error('Add at least one substantial section. Use ## before a section heading.');
      const topic = saveLocalTopic({ title: title.trim(), byline: byline.trim(), summary: summary.trim(), category: category.trim() || 'Research notes', level, terms: parseTerms(terms), sections, sources: parseSources(sources) });
      onCreated(topic);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The topic could not be saved in this browser.');
    }
  }

  return <main className="q-page library-page library-editor-page"><header className="library-editor-header"><p className="q-eyebrow">LOCAL RESEARCH AUTHORING</p><h1>Write a new library topic.</h1><p>Compose a structured article as plain text. Your work is saved only in this browser; it is not uploaded, reviewed, or shared with other users.</p></header>
    <div className="library-editor-layout"><form className="library-editor" onSubmit={submit}><div className="library-editor-row"><label>Article title<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A clear, specific title" /></label><label>Author or byline<input maxLength={120} value={byline} onChange={(event) => setByline(event.target.value)} placeholder="Optional" /></label></div>
      <label>Abstract or summary<textarea required maxLength={1200} rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="State the topic, scope, and main conclusion." /></label>
      <div className="library-editor-row"><label>Topic area<input required maxLength={80} value={category} onChange={(event) => setCategory(event.target.value)} /></label><label>Reading level<select value={level} onChange={(event) => setLevel(event.target.value as LibraryTopic['level'])}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div>
      <label>Article manuscript<span>Use ## for section headings, blank lines for paragraphs, and - for bullet points.</span><textarea className="library-manuscript" required maxLength={60000} rows={24} value={body} onChange={(event) => setBody(event.target.value)} placeholder={'## Introduction\n\nWrite the opening section.\n\n## Method\n\nDescribe the method.'} /></label>
      <div className="library-editor-row"><label>Key terms<span>One per line: Term: Definition</span><textarea rows={7} maxLength={8000} value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Amplitude: A complex coefficient..." /></label><label>Sources<span>One per line: Title | https://...</span><textarea rows={7} maxLength={12000} value={sources} onChange={(event) => setSources(event.target.value)} placeholder="Book or paper title | https://example.org" /></label></div>
      {error && <div className="library-editor-error" role="alert"><strong>Topic not saved</strong><p>{error}</p></div>}
      <div className="library-editor-actions"><a className="q-button q-button-secondary" href="/library">Cancel</a><button className="q-button q-button-primary" type="submit">Save topic in this browser</button></div>
    </form><aside className="library-editor-help"><h2>Before you publish locally</h2><ul><li>Write original or permitted material.</li><li>Cite research papers, books, or reliable documentation.</li><li>Separate evidence from interpretation.</li><li>Check equations and scientific claims.</li><li>Do not include private information.</li></ul><p><strong>Storage:</strong> browser local storage on this device only. Clearing site data removes these topics.</p><p><strong>Safety:</strong> text is rendered as text, not executable HTML. PDF uploads are not accepted by this editor.</p></aside></div>
  </main>;
}
