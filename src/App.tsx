import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  categories,
  getCategory,
  getCategoryEntries,
  getEntry,
} from './catalog/catalog'
import type { CatalogEntry, CategoryDefinition } from './catalog/types'
import type { CatalogTag, TagGroup } from './catalog/types'

const MarkdownDocument = lazy(() => import('./components/MarkdownDocument'))

type Route =
  | { page: 'home' }
  | { page: 'category'; category: string }
  | { page: 'entry'; category: string; slug: string }

type Theme = 'light' | 'dark'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.25 15.13A8.5 8.5 0 0 1 8.87 3.75a8.5 8.5 0 1 0 11.38 11.38Z" />
    </svg>
  )
}

function FullscreenIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {expanded ? (
        <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
      ) : (
        <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
      )}
    </svg>
  )
}

function parseRoute(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'category' && parts[1]) return { page: 'category', category: parts[1] }
  if (parts[0] === 'entry' && parts[1] && parts[2]) {
    return { page: 'entry', category: parts[1], slug: parts[2] }
  }
  return { page: 'home' }
}

function useRoute() {
  const [route, setRoute] = useState<Route>(parseRoute)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute())
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}

function Shell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('component-atlas-theme', theme)
  }, [theme])

  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#/" aria-label="Component Atlas home">
          <span className="brand-mark" aria-hidden="true">CA</span>
          <span>Component Atlas</span>
        </a>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setTheme(nextTheme)}
          aria-label={`Switch to ${nextTheme} theme`}
          title={`Switch to ${nextTheme} theme`}
        >
          <span className="theme-toggle-icon" aria-hidden="true">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </span>
          <span>{nextTheme} mode</span>
        </button>
      </header>
      <main>{children}</main>
      <footer>
        <span>Component Atlas · React experiments.</span>
      </footer>
    </div>
  )
}

function CategoryCard({ category }: { category: CategoryDefinition }) {
  const count = getCategoryEntries(category.id).length
  return (
    <a className="category-card" href={`#/category/${category.id}`}>
      <h2>{category.title}</h2>
      <p>{category.description}</p>
      <span className="count">{count.toString().padStart(2, '0')} {count === 1 ? 'entry' : 'entries'}</span>
    </a>
  )
}

function EntryCard({ entry }: { entry: CatalogEntry }) {
  return (
    <a className="entry-card" href={`#/entry/${entry.category}/${entry.slug}`}>
      <div className="entry-card-body">
        <div className="entry-card-topline">
          <span>{entry.kind}</span>
          <span>{entry.status}</span>
        </div>
        <h2>{entry.title}</h2>
        <p>{entry.summary}</p>
        <TagList tags={entry.tags} />
      </div>
    </a>
  )
}

const tagGroupLabels: Record<TagGroup, string> = {
  input: 'Input',
  feature: 'Feature',
  technology: 'Technology',
  support: 'Support',
  style: 'Style',
}

function TagList({ tags, large = false }: { tags: CatalogTag[]; large?: boolean }) {
  const groups = (Object.keys(tagGroupLabels) as TagGroup[])
    .map((group) => ({ group, tags: tags.filter((tag) => tag.group === group) }))
    .filter(({ tags: groupTags }) => groupTags.length > 0)

  return (
    <div className={`tag-row${large ? ' large' : ''}`}>
      {groups.map(({ group, tags: groupTags }) => (
        <div className="tag-group" key={group} aria-label={tagGroupLabels[group]}>
          {large && <span className="tag-group-label">{tagGroupLabels[group]}</span>}
          {groupTags.map((tag) => (
            <span className="tag" data-group={group} key={tag.label}>{tag.label}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-kicker"><span /> React components, effects, and experiments</div>
        <h1>Interesting ideas,<br /><em>made tangible.</em></h1>
        <p className="hero-copy">
          A curated workshop for visual effects and interaction patterns—implemented as focused,
          reusable React pieces and documented well enough to revisit later.
        </p>
      </section>

      <section className="catalog-section">
        <div className="catalog-heading">
          <h2>Browse by category</h2>
          <p>Start with a category. Demos are loaded only when you open an entry.</p>
        </div>
        <div className="category-grid">
          {categories.map((category) => <CategoryCard key={category.id} category={category} />)}
        </div>
      </section>
    </>
  )
}

function LoadingBlock({ label = 'Loading entry' }: { label?: string }) {
  return <div className="loading-block"><span />{label}</div>
}

function CategoryPage({ categoryId }: { categoryId: string }) {
  const category = getCategory(categoryId)
  const categoryEntries = getCategoryEntries(categoryId)

  if (!category) return <NotFound />

  return (
    <>
      <section className="page-intro">
        <a className="back-link" href="#/">← All categories</a>
        <div className="page-intro-row">
          <div>
            <span className="eyebrow">{category.eyebrow}</span>
            <h1>{category.title}</h1>
          </div>
          <p>{category.description}</p>
        </div>
      </section>
      <section className="entry-list-section">
        {categoryEntries.length > 0 ? (
          <div className="entry-grid">
            {categoryEntries.map((entry) => <EntryCard key={entry.key} entry={entry} />)}
          </div>
        ) : (
          <div className="empty-state"><span>Open shelf</span><h2>No entries yet.</h2><p>The category is ready for its first focused experiment.</p></div>
        )}
      </section>
    </>
  )
}

function EntryPage({ entry }: { entry: CatalogEntry }) {
  const Demo = entry.Demo
  const [readme, setReadme] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [usesFullscreenFallback, setUsesFullscreenFallback] = useState(false)
  const demoStageRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    entry.loadReadme().then((content) => active && setReadme(content))
    return () => { active = false }
  }, [entry])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsExpanded(document.fullscreenElement === demoStageRef.current)
      if (document.fullscreenElement === demoStageRef.current) setUsesFullscreenFallback(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && usesFullscreenFallback) {
        setUsesFullscreenFallback(false)
        setIsExpanded(false)
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [usesFullscreenFallback])

  useEffect(() => {
    document.body.classList.toggle('demo-expanded', usesFullscreenFallback)
    return () => document.body.classList.remove('demo-expanded')
  }, [usesFullscreenFallback])

  const toggleFullscreen = async () => {
    const stage = demoStageRef.current
    if (!stage) return

    if (document.fullscreenElement === stage) {
      await document.exitFullscreen()
      return
    }

    if (usesFullscreenFallback) {
      setUsesFullscreenFallback(false)
      setIsExpanded(false)
      return
    }

    try {
      await stage.requestFullscreen()
    } catch {
      setUsesFullscreenFallback(true)
      setIsExpanded(true)
    }
  }

  return (
    <>
      <section className="entry-intro">
        <a className="back-link" href={`#/category/${entry.category}`}>← {getCategory(entry.category)?.title}</a>
        <div className="entry-heading-row">
          <div>
            <span className="eyebrow">{entry.kind} · {entry.status}</span>
            <h1>{entry.title}</h1>
            <p>{entry.summary}</p>
          </div>
          <TagList tags={entry.tags} large />
        </div>
      </section>
      <section
        ref={demoStageRef}
        className={`demo-stage${usesFullscreenFallback ? ' is-expanded' : ''}`}
        data-expanded={isExpanded || undefined}
        aria-label={`${entry.title} live demo`}
      >
        {entry.compatibility && (
          <div className="compatibility-banner" role="note">
            <span aria-hidden="true">!</span>
            <p><strong>Touch compatibility</strong>{entry.compatibility.message}</p>
          </div>
        )}
        <div className="demo-stage-label">
          <span>Preview</span>
          <button
            className="fullscreen-toggle"
            type="button"
            onClick={toggleFullscreen}
            aria-label={isExpanded ? 'Exit full screen preview' : 'Open full screen preview'}
            aria-pressed={isExpanded}
            title={isExpanded ? 'Exit full screen (Esc)' : 'Open full screen'}
          >
            <span className="fullscreen-icon" aria-hidden="true">
              <FullscreenIcon expanded={isExpanded} />
            </span>
            <span>{isExpanded ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        </div>
        <div className="demo-stage-content">
          <Suspense fallback={<LoadingBlock />}><Demo /></Suspense>
        </div>
      </section>
      {!entry.hideDocumentation && (
        <section className="readme-section">
          {readme ? (
            <Suspense fallback={<LoadingBlock label="Loading documentation" />}>
              <MarkdownDocument content={readme} hideTitle />
            </Suspense>
          ) : <LoadingBlock label="Loading documentation" />}
        </section>
      )}
    </>
  )
}

function NotFound() {
  return <section className="not-found"><span>404</span><h1>Nothing lives here yet.</h1><a href="#/">Return to the catalog</a></section>
}

export default function App() {
  const route = useRoute()
  let content

  if (route.page === 'home') content = <HomePage />
  else if (route.page === 'category') content = <CategoryPage categoryId={route.category} />
  else {
    const entry = getEntry(route.category, route.slug)
    content = entry ? <EntryPage entry={entry} /> : <NotFound />
  }

  return <Shell>{content}</Shell>
}
