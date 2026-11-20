import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { MAX_CHILDREN, MAX_CONTENT, op, parseTags } from './api.js';

// Read-only viewer: nodes are created and edited only from Claude sessions
// through the MCP / command line tools (see CLAUDE.md).

const md = (text) => ({ __html: DOMPurify.sanitize(marked.parse(text || '')) });

function TreeItem({ node, selectedId, onSelect, open, toggle }) {
  const isOpen = open.has(node.id);
  return (
    <li>
      <div className={`tree-row${node.id === selectedId ? ' selected' : ''}`}>
        <button className="twisty" onClick={() => toggle(node.id)} disabled={!node.child_count}
          aria-label={isOpen ? 'collapse' : 'expand'}>
          {node.child_count ? (isOpen ? '▾' : '▸') : '·'}
        </button>
        <button className="tree-title" onClick={() => onSelect(node.id)}>{node.title}</button>
        {node.child_count >= MAX_CHILDREN && <span className="full" title="5/5 children">full</span>}
      </div>
      {isOpen && node.children?.length > 0 && (
        <ul>{node.children.map((c) => (
          <TreeItem key={c.id} node={c} selectedId={selectedId} onSelect={onSelect} open={open} toggle={toggle} />
        ))}</ul>
      )}
    </li>
  );
}

// How full the node's content is, against the per-node character limit.
function ContentMeter({ length, max }) {
  const pct = Math.min(100, (length / max) * 100);
  const level = pct >= 90 ? 'high' : pct >= 75 ? 'mid' : 'low';
  const fmt = (n) => n.toLocaleString('en-US');
  return (
    <div className={`content-meter ${level}`}
      title={`${fmt(max - length)} characters left before the node must be split`}>
      <div className="meter-bar" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={length}
        aria-label="content size">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="meter-label">{fmt(length)} / {fmt(max)} characters · {Math.round(pct)}%</span>
    </div>
  );
}

const Tags = ({ tags, onTag }) => (
  <div className="tags">{tags.map((t) => (
    <button key={t} className="tag" onClick={() => onTag?.(t)} title="find nodes with this tag">{t}</button>
  ))}</div>
);

function SearchPanel({ onSelect, initialTag }) {
  const [mode, setMode] = useState('tags');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const run = useCallback(async (m = mode, query = q) => {
    if (!query.trim()) return;
    setError('');
    try {
      setResults(m === 'tags'
        ? await op('find_nodes_by_tags', { tags: parseTags(query), partial: true })
        : await op('search_text', { query }));
    } catch (e) { setError(e.message); }
  }, [mode, q]);

  useEffect(() => {
    if (initialTag) { setMode('tags'); setQ(initialTag.tag); run('tags', initialTag.tag); }
  }, [initialTag]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="search">
      <div className="row">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="tags">Tags</option>
          <option value="text">Text</option>
        </select>
        <input placeholder={mode === 'tags' ? 'sqlite, search, …' : 'full-text search'} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
      </div>
      {error && <p className="error">{error}</p>}
      {results && (
        <ul className="results">
          {results.length === 0 && <li className="muted">No match</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button onClick={() => onSelect(r.id)}>{r.title}</button>
              <div className="muted small">{r.path}</div>
              {r.matched_tags && <div className="small">matched: {r.matched_tags.join(', ')}</div>}
              {r.snippet && <div className="small">{r.snippet}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const [tree, setTree] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [node, setNode] = useState(null);
  const [open, setOpen] = useState(new Set());
  const [tagQuery, setTagQuery] = useState(null);
  const [error, setError] = useState('');

  const loadTree = useCallback(async () => {
    const t = await op('get_tree');
    setTree(t);
    return t;
  }, []);

  useEffect(() => {
    loadTree().then((t) => {
      if (t) { setSelectedId(t.id); setOpen(new Set([t.id])); }
    }).catch((e) => setError(e.message));
  }, [loadTree]);

  useEffect(() => {
    if (selectedId == null) return;
    op('get_node', { id: selectedId }).then(setNode).catch((e) => setError(e.message));
  }, [selectedId]);

  const select = (id) => {
    setSelectedId(id);
    op('get_node', { id, include_content: false }).then((n) => {
      setOpen((o) => new Set([...o, ...n.path.map((p) => p.id)]));
    });
  };

  const toggle = (id) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Content changes happen in Claude sessions: reload the tree and the current node.
  const refresh = async () => {
    setError('');
    try {
      const t = await loadTree();
      const id = selectedId ?? t?.id;
      if (id != null) {
        setNode(await op('get_node', { id }).catch(() => (setSelectedId(t?.id), null)));
      }
    } catch (e) { setError(e.message); }
  };

  const content = useMemo(() => md(node?.content), [node]);

  return (
    <div className="app">
      <header>
        <h1>Knowledge Tree</h1>
        <span className="muted">read-only · content is edited from Claude sessions</span>
        <button className="secondary refresh" onClick={refresh}>Refresh</button>
      </header>
      <aside>
        <SearchPanel onSelect={select} initialTag={tagQuery} />
        <nav className="tree">
          {tree ? <ul><TreeItem node={tree} selectedId={selectedId} onSelect={select} open={open} toggle={toggle} /></ul>
            : <p className="muted">Empty tree — run <code>npm run seed</code>.</p>}
        </nav>
      </aside>
      <main>
        {error && <p className="error" onClick={() => setError('')}>{error}</p>}
        {node && (
          <article>
            <div className="breadcrumb">
              {node.path.map((p, i) => (
                <span key={p.id}>{i > 0 && ' › '}<button onClick={() => select(p.id)}>{p.title}</button></span>
              ))}
            </div>
            <h2>{node.title}</h2>
            <Tags tags={node.tags} onTag={(t) => setTagQuery({ tag: t, at: Date.now() })} />
            <ContentMeter length={node.content_length ?? node.content.length} max={node.max_content ?? MAX_CONTENT} />
            <div className="content card" dangerouslySetInnerHTML={content} />
            <div className="grid">
              <section className="card">
                <h4>Children ({node.children.length}/{MAX_CHILDREN})</h4>
                {node.children.length === 0 ? <p className="muted">none</p> : (
                  <ul>{node.children.map((c) => (
                    <li key={c.id}><button onClick={() => select(c.id)}>{c.title}</button></li>
                  ))}</ul>
                )}
              </section>
              <section className="card">
                <h4>Links</h4>
                {node.links_out.length + node.links_in.length === 0 && <p className="muted">none</p>}
                <ul>
                  {node.links_out.map((l) => (
                    <li key={`o${l.id}`}>→ <button onClick={() => select(l.id)}>{l.title}</button>{l.note && <span className="muted"> — {l.note}</span>}</li>
                  ))}
                  {node.links_in.map((l) => (
                    <li key={`i${l.id}`}>← <button onClick={() => select(l.id)}>{l.title}</button>{l.note && <span className="muted"> — {l.note}</span>}</li>
                  ))}
                </ul>
              </section>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
