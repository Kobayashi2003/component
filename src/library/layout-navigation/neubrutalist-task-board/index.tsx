import { useMemo, useState } from 'react'
import './styles.css'

type Filter = 'all' | 'open' | 'done'

const initialTasks = [
  { id: 1, title: 'Map the onboarding flow', label: 'Research', color: 'yellow', done: false },
  { id: 2, title: 'Review motion tokens', label: 'Design', color: 'pink', done: true },
  { id: 3, title: 'Ship keyboard shortcuts', label: 'Build', color: 'blue', done: false },
  { id: 4, title: 'Write empty-state copy', label: 'Content', color: 'green', done: false },
]

export default function NeubrutalistTaskBoard() {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<Filter>('all')

  const visibleTasks = useMemo(
    () => tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.done : !task.done)),
    [filter, tasks],
  )
  const completed = tasks.filter((task) => task.done).length

  function toggleTask(id: number) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task))
  }

  return (
    <div className="neubrutalist-board">
      <header className="board-header">
        <div>
          <span className="board-kicker">Sprint 04 / 06</span>
          <h2>Make it unmistakable.</h2>
          <p>Small team, loud ideas, no hidden states.</p>
        </div>
        <div className="board-progress" role="group" aria-label={`${completed} of ${tasks.length} tasks complete`}>
          <strong>{String(completed).padStart(2, '0')}</strong>
          <span>/ {String(tasks.length).padStart(2, '0')} done</span>
        </div>
      </header>

      <div className="board-toolbar" role="group" aria-label="Task filters">
        {(['all', 'open', 'done'] as Filter[]).map((item) => (
          <button key={item} className={filter === item ? 'is-active' : ''} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item === 'all' ? 'All tasks' : item === 'open' ? 'Open' : 'Completed'}
          </button>
        ))}
      </div>

      <div className="task-grid">
        {visibleTasks.map((task) => (
          <article className={`task-card ${task.color} ${task.done ? 'is-done' : ''}`} key={task.id}>
            <div className="task-meta"><span>{task.label}</span><span>#{String(task.id).padStart(2, '0')}</span></div>
            <h3>{task.title}</h3>
            <button className="task-toggle" type="button" aria-pressed={task.done} onClick={() => toggleTask(task.id)}>
              <span aria-hidden="true">{task.done ? '✓' : '+'}</span>{task.done ? 'Completed' : 'Mark complete'}
            </button>
          </article>
        ))}
      </div>
      {visibleTasks.length === 0 && <p className="board-empty">Nothing in this lane yet.</p>}
    </div>
  )
}
