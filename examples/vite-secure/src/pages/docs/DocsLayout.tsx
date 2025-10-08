import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { sidebar } from './sidebar'
import './docs.css'

export const DocsLayout: React.FC<{ children: React.ReactNode }>= ({ children }) => {
  const { pathname } = useLocation()
  return (
    <div className="docs-container">
      <aside className="docs-sidebar">
        <div className="docs-logo">Docs</div>
        {sidebar.map((group) => (
          <div key={group.text} className="docs-group">
            <div className="docs-group-title">{group.text}</div>
            <div className="docs-items">
              {group.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={
                    'docs-link' + (pathname === item.path ? ' docs-link-active' : '')
                  }
                >
                  {item.text}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </aside>
      <main className="docs-content">{children}</main>
    </div>
  )
}

