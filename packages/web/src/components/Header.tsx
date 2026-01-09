interface HeaderProps {
  onAboutClick: () => void
}

export function Header({ onAboutClick }: HeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-700">
      <div className="container mx-auto px-4 py-4 max-w-7xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LogScrub</h1>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="./help.html"
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Help
          </a>
          <button
            onClick={onAboutClick}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            About
          </button>
          <span
            className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline cursor-help"
            title="Your data never leaves your browser."
          >
            100% client-side
          </span>
          <a
            href="https://ko-fi.com/pitstopper"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 hidden sm:inline"
            title="Buy us a coffee!"
          >
            ☕ Ko-fi
          </a>
        </div>
      </div>
    </header>
  )
}
