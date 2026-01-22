import { Icon } from './ui'

interface HeaderProps {
  onAboutClick: () => void
  compact?: boolean
}

export function Header({ onAboutClick, compact = false }: HeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-700">
      <div className={`container mx-auto px-4 max-w-7xl flex items-center justify-between ${compact ? 'py-2' : 'py-4'}`}>
        {/* Logo and branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Icon name="shield" size="lg" className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} text-blue-600`} />
            <h1 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-gray-900 dark:text-white`}>LogScrub</h1>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full">
            beta
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <a
            href="./help.html"
            className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Help
          </a>
          <button
            onClick={onAboutClick}
            className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            About
          </button>

          {/* Separator */}
          <div className="hidden sm:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />

          {/* Client-side indicator */}
          <span
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 cursor-help"
            title="Your data never leaves your browser."
          >
            <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
            <span>100% client-side</span>
          </span>

          {/* Separator */}
          <div className="hidden sm:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />

          {/* Support link */}
          <a
            href="https://ko-fi.com/pitstopper"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 px-2 py-1 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            title="Buy us a coffee!"
          >
            <span aria-hidden="true">☕</span>
            <span>Ko-fi</span>
          </a>
        </nav>
      </div>
    </header>
  )
}
