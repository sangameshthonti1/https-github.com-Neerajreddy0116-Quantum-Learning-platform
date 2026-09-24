import { useMemo, useState } from "react";
import { Link, navigate } from "../app/navigation";
import { ActionLink, Badge, Icon, PageHeading } from "../app/ui";
import {
  libraryTopics,
  type LibrarySection,
  type LibraryTopic,
} from "./content";
import LibraryEditor from "./LibraryEditor";
import LibraryUnlock, { LockedLibraryTopic } from "./LibraryUnlock";
import {
  freeLibraryTopicCount,
  isLibraryTopicLocked,
  useDemoLibraryAccess,
} from "./access";
import { removeLocalTopic, useLocalLibraryTopics } from "./localTopics";
import "./library.css";

function topicMatches(topic: LibraryTopic, query: string, category: string) {
  if (category !== "All topics" && topic.category !== category) return false;
  const words =
    `${topic.title} ${topic.summary} ${topic.category} ${topic.terms.map((item) => item.term).join(" ")}`.toLowerCase();
  return words.includes(query.trim().toLowerCase());
}

function LibraryCatalog({
  topics,
  hasDemoAccess,
}: {
  topics: readonly LibraryTopic[];
  hasDemoAccess: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All topics");
  const categories = useMemo(
    () => ["All topics", ...new Set(topics.map((topic) => topic.category))],
    [topics],
  );
  const visible = useMemo(
    () => topics.filter((topic) => topicMatches(topic, query, category)),
    [topics, query, category],
  );

  return (
    <main className="q-page library-page">
      <PageHeading
        eyebrow="QUANTUM KNOWLEDGE LIBRARY"
        title="A reference you can read, not just download."
      >
        Beginner quantum material reorganized into accessible topic articles
        with clear sections, equations, definitions, checks, and source notes.
      </PageHeading>
      <section className="library-hero" aria-label="About the Quantum Library">
        <div>
          <Badge tone="blue">TEXT-FIRST REFERENCE</Badge>
          <h2>Explore one idea at a time.</h2>
          <p>
            The supplied notes are presented as structured web content. Original
            PDFs are available only as optional source downloads, and browsing
            never creates lesson progress.
          </p>
          <div className="library-hero-actions">
            {!hasDemoAccess && (
              <ActionLink href="/library/unlock">
                Unlock all topics · demo
              </ActionLink>
            )}
            <ActionLink href="/library/new" secondary={!hasDemoAccess}>
              Write a local topic
            </ActionLink>
            <span>
              {hasDemoAccess
                ? `${libraryTopics.length} reviewed topics unlocked in this browser`
                : `${freeLibraryTopicCount} free · ${libraryTopics.length - freeLibraryTopicCount} demo-locked`}{" "}
              {" · "}
              {topics.length - libraryTopics.length} local
            </span>
          </div>
        </div>
        <div className="library-orbit" aria-hidden="true">
          <span>|0⟩</span>
          <i>H</i>
          <span>|ψ⟩</span>
        </div>
      </section>
      <section className="library-controls" aria-label="Find a topic">
        <label>
          <span>Search the library</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search concepts and terms"
          />
        </label>
        <label>
          <span>Topic area</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <p aria-live="polite">
          {visible.length} {visible.length === 1 ? "article" : "articles"}
        </p>
      </section>
      {visible.length ? (
        <div className="library-topic-grid">
          {visible.map((topic, index) => {
            const locked = isLibraryTopicLocked(topic, hasDemoAccess);
            const accessLabel = topic.local
              ? "Your topic"
              : locked
                ? "Locked"
                : hasDemoAccess
                  ? "Unlocked"
                  : "Free";
            return (
              <article
                className="library-topic-card"
                key={topic.slug}
                data-local={topic.local || undefined}
                data-locked={locked || undefined}
              >
                <span className="library-topic-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="q-inline-meta">
                  <Badge tone={topic.local ? "blue" : "neutral"}>
                    {topic.local ? "Local draft" : topic.category}
                  </Badge>
                  <span>{topic.level}</span>
                  <span
                    className="library-access-state"
                    data-state={locked ? "locked" : "open"}
                  >
                    {locked && <span aria-hidden="true">⌑ </span>}
                    {accessLabel}
                  </span>
                </div>
                <h2>
                  <Link href={`/library/${topic.slug}`}>{topic.title}</Link>
                </h2>
                <p>{topic.summary}</p>
                <div className="library-topic-foot">
                  <span>
                    {topic.sections.length} sections · {topic.terms.length} key
                    terms
                  </span>
                  <Link
                    href={`/library/${topic.slug}`}
                    aria-label={`${locked ? "Preview locked" : "Read"} ${topic.title}`}
                  >
                    <Icon name="arrow" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="library-no-results">
          <h2>No matching topics</h2>
          <p>Try a broader word or choose All topics.</p>
          <button
            className="q-button q-button-secondary"
            onClick={() => {
              setQuery("");
              setCategory("All topics");
            }}
          >
            Clear filters
          </button>
        </section>
      )}
      <footer className="q-page-footer">
        <span>Text-first reading · Optional PDF source downloads</span>
        <span>
          {hasDemoAccess
            ? "Demo access is active in this browser"
            : "First three reviewed topics are free"}
        </span>
      </footer>
    </main>
  );
}

function KnowledgeChecks({ section }: { section: LibrarySection }) {
  if (!section.checks?.length) return null;
  return (
    <div className="library-checks">
      {section.checks.map((check, index) => (
        <article key={check.question}>
          <span>QUESTION {String(index + 1).padStart(2, "0")}</span>
          <h3>{check.question}</h3>
          {check.options && (
            <ol type="A">
              {check.options.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ol>
          )}
          <details>
            <summary>Check answer</summary>
            <p>{check.answer}</p>
          </details>
        </article>
      ))}
    </div>
  );
}

function SectionContent({ section }: { section: LibrarySection }) {
  return (
    <section id={section.id} className="library-article-section">
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph}`}>{paragraph}</p>
      ))}
      {section.bullets && (
        <ul>
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {section.equation && (
        <figure className="library-equation">
          <div>{section.equation.notation}</div>
          <figcaption>{section.equation.explanation}</figcaption>
        </figure>
      )}
      {section.note && (
        <aside className="library-note">
          <strong>{section.note.title}</strong>
          <p>{section.note.text}</p>
        </aside>
      )}
      {section.subsections?.map((subsection) => (
        <section
          id={subsection.id}
          className="library-subsection"
          key={subsection.id}
        >
          <h3>{subsection.title}</h3>
          {subsection.paragraphs.map((paragraph, index) => (
            <p key={`${index}:${paragraph}`}>{paragraph}</p>
          ))}
          {subsection.bullets && (
            <ul>
              {subsection.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {subsection.equation && (
            <figure className="library-equation">
              <div>{subsection.equation.notation}</div>
              <figcaption>{subsection.equation.explanation}</figcaption>
            </figure>
          )}
        </section>
      ))}
      <KnowledgeChecks section={section} />
    </section>
  );
}

function LibraryArticle({
  topic,
  topics,
}: {
  topic: LibraryTopic;
  topics: readonly LibraryTopic[];
}) {
  const related = (topic.relatedSlugs ?? [])
    .map((slug) => topics.find((item) => item.slug === slug))
    .filter((item): item is LibraryTopic => !!item);
  function remove() {
    if (
      !topic.local ||
      !window.confirm(`Delete “${topic.title}” from this browser?`)
    )
      return;
    if (removeLocalTopic(topic.slug)) navigate("/library");
  }
  return (
    <main className="q-page library-page library-article-page">
      <nav className="library-breadcrumb" aria-label="Breadcrumb">
        <Link href="/library">Quantum Library</Link>
        <span aria-hidden="true">/</span>
        <span>{topic.title}</span>
      </nav>
      <header className="library-article-header">
        <div className="q-inline-meta">
          <Badge tone={topic.local ? "blue" : "neutral"}>
            {topic.local ? "LOCAL BROWSER TOPIC" : topic.category}
          </Badge>
          <span>{topic.level}</span>
          <span>Updated {topic.updated}</span>
        </div>
        <h1>{topic.title}</h1>
        {topic.byline && <p className="library-byline">By {topic.byline}</p>}
        <p>{topic.summary}</p>
        {!!topic.downloads?.length && (
          <div
            className="library-downloads"
            role="group"
            aria-label="Download original source notes"
          >
            {topic.downloads.map((item) => (
              <a key={item.href} href={item.href} download>
                <span aria-hidden="true">↓</span> {item.label}
                <small>PDF</small>
              </a>
            ))}
          </div>
        )}
        {topic.local && (
          <p className="library-local-notice">
            Saved only in this browser. This article has not been reviewed or
            uploaded to the platform server.
          </p>
        )}
      </header>
      <div className="library-reading-layout">
        <aside className="library-index">
          <p>IN THIS ARTICLE</p>
          <nav aria-label="On this page">
            <ol>
              {topic.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                  {section.subsections?.length ? (
                    <ol>
                      {section.subsections.map((subsection) => (
                        <li key={subsection.id}>
                          <a href={`#${subsection.id}`}>{subsection.title}</a>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <article className="library-article-body">
          {topic.sections.map((section) => (
            <SectionContent key={section.id} section={section} />
          ))}
          {topic.terms.length > 0 && (
            <section id="key-terms" className="library-glossary">
              <h2>Key terms</h2>
              <dl>
                {topic.terms.map((item) => (
                  <div key={item.term}>
                    <dt>{item.term}</dt>
                    <dd>{item.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {topic.sources.length > 0 && (
            <section id="sources" className="library-sources">
              <h2>Sources and further reading</h2>
              <ol>
                {topic.sources.map((source) => (
                  <li key={`${source.title}:${source.author ?? ""}`}>
                    <cite>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}
                    </cite>
                    {source.author && <span> · {source.author}</span>}
                    {source.note && <p>{source.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>
        <aside className="library-facts" aria-label="Article details">
          <p>AT A GLANCE</p>
          <dl>
            <div>
              <dt>Topic</dt>
              <dd>{topic.category}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{topic.level}</dd>
            </div>
            <div>
              <dt>Sections</dt>
              <dd>{topic.sections.length}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>{topic.sources.length}</dd>
            </div>
          </dl>
          {topic.terms.length > 0 && (
            <>
              <h2>Key vocabulary</h2>
              <ul>
                {topic.terms.slice(0, 6).map((item) => (
                  <li key={item.term}>{item.term}</li>
                ))}
              </ul>
            </>
          )}
          {topic.local && (
            <button className="library-delete" onClick={remove}>
              Delete local topic
            </button>
          )}
        </aside>
      </div>
      {related.length > 0 && (
        <section className="library-related">
          <h2>Related topics</h2>
          <div>
            {related.map((item) => (
              <Link key={item.slug} href={`/library/${item.slug}`}>
                {item.title}
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
      <footer className="q-page-footer">
        <span>
          {topic.local
            ? "Local browser article · Not reviewed"
            : "Reviewed reference article"}
        </span>
        <Link href="/library">Back to all topics</Link>
      </footer>
    </main>
  );
}

function MissingTopic() {
  return (
    <main className="q-page library-page">
      <section className="library-empty library-missing">
        <div className="library-empty-mark" aria-hidden="true">
          ?
        </div>
        <div>
          <p className="q-eyebrow">ARTICLE NOT FOUND</p>
          <h1>This topic has not been published.</h1>
          <p>
            The address may be outdated, or the article may still be under
            review. No substitute or generated content has been inserted.
          </p>
          <ActionLink href="/library">Browse the library</ActionLink>
        </div>
      </section>
    </main>
  );
}

export default function KnowledgeLibrary({ slug }: { slug?: string }) {
  const localTopics = useLocalLibraryTopics();
  const hasDemoAccess = useDemoLibraryAccess();
  const topics = useMemo(
    () => [...libraryTopics, ...localTopics],
    [localTopics],
  );
  if (!slug)
    return <LibraryCatalog topics={topics} hasDemoAccess={hasDemoAccess} />;
  if (slug === "new")
    return (
      <LibraryEditor
        onCreated={(topic) => navigate(`/library/${topic.slug}`)}
      />
    );
  if (slug === "unlock") {
    const requestedTopic = new URL(window.location.href).searchParams.get(
      "topic",
    );
    const target = requestedTopic
      ? libraryTopics.find((item) => item.slug === requestedTopic)
      : undefined;
    return <LibraryUnlock target={target} />;
  }
  const topic = topics.find((item) => item.slug === slug);
  if (!topic) return <MissingTopic />;
  if (isLibraryTopicLocked(topic, hasDemoAccess))
    return <LockedLibraryTopic topic={topic} />;
  return <LibraryArticle topic={topic} topics={topics} />;
}
