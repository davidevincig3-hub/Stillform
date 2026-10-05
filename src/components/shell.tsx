'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  House,
  HeartPulse,
  Footprints,
  Dumbbell,
  CalendarDays,
  Sparkles,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { useWorkout } from './workout-provider';
import { mockCoach } from '@/ai/coach';
import { useBrowserValue, writeBrowserValue } from './browser-storage';
const links = [
  { href: '/', label: 'Home', icon: House },
  { href: '/recovery', label: 'Recovery', icon: HeartPulse },
  { href: '/running', label: 'Running', icon: Footprints },
  { href: '/gym', label: 'Gym', icon: Dumbbell },
  { href: '/plan', label: 'Plan', icon: CalendarDays },
];
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { store, error } = useWorkout();
  const dark = useBrowserValue('theme') === 'dark';
  const [coach, setCoach] = useState(false);
  const [full, setFull] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker
        .register('/sw.js')
        .catch((error) =>
          console.error('Service worker registration failed:', error),
        );
  }, []);
  function theme() {
    try {
      writeBrowserValue('theme', dark ? 'light' : 'dark');
    } catch {
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    }
  }
  const workout = path === '/gym/workout';
  return (
    <>
      <header
        className={
          process.env.NODE_ENV === 'development'
            ? 'topbar dev-topbar'
            : 'topbar'
        }
      >
        <Link href="/" className="brand">
          <Activity size={24} />
          <span>
            Stillform<span className="brand-sub">TRAINING & RECOVERY</span>
          </span>
        </Link>
        <div className="row">
          <span className="sample-badge">
            {path.startsWith('/gym')
              ? 'GYM · REAL LOCAL DATA'
              : path.startsWith('/activities') || path === '/integrations'
                ? 'REAL ACTIVITY REGISTRY'
                : path === '/'
                  ? 'HOME · SEE DATA LABELS'
                  : path === '/recovery'
                    ? 'RECOVERY · SEE DATA LABELS'
                    : 'DEMO · SAMPLE DATA'}
          </span>
          <button
            className="icon-button"
            onClick={theme}
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      {!workout && (
        <nav className="navigation" aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                path === href || (href !== '/' && path.startsWith(href + '/'))
                  ? 'page'
                  : undefined
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
      <main className={workout ? 'workout-main' : 'main'}>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {children}
      </main>
      {store.active && !workout && (
        <Link href="/gym/workout" className="workout-pill">
          <span className="live-dot" />
          Workout in progress · {store.active.routineName} →
        </Link>
      )}
      <button
        className="coach-button"
        aria-label="Open AI Coach"
        onClick={() => setCoach(true)}
      >
        <Sparkles size={20} />
        <span>Coach</span>
      </button>
      {coach && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="AI Coach demo"
          className={`coach-panel ${full ? 'full-chat' : ''}`}
        >
          <div className="row">
            <h3>
              AI Coach <span className="tag">Demo</span>
            </h3>
            <button
              className="icon-button"
              aria-label="Close coach"
              onClick={() => setCoach(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p className="muted">
            Context:{' '}
            {workout ? 'active workout' : path === '/' ? 'Home' : path.slice(1)}
            . No model or literature provider is connected.
          </p>
          {full && (
            <p className="caption">
              Conversation history is held in memory for this demo.
            </p>
          )}
          <div className="chat-messages">
            {messages.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!question.trim()) return;
              const response = await mockCoach.ask(question, { page: path });
              setMessages([...messages, `You: ${question}`, response.text]);
              setQuestion('');
            }}
          >
            <label htmlFor="coach-question">Ask about this page</label>
            <textarea
              id="coach-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should I understand about this trend?"
            />
            <button className="primary" type="submit">
              Try contextual question
            </button>
          </form>
          <button className="text-button" onClick={() => setFull(!full)}>
            {full ? 'Compact coach' : 'Open full chat'} →
          </button>
        </section>
      )}
    </>
  );
}
