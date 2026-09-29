import { useEffect, useState } from 'react';
import { getAccountGreeting } from '../utils/accountGreeting.js';
import './account-greeting.css';

export default function AccountGreeting({ name, logoUrl = '', companyName = '' }) {
  const [greeting, setGreeting] = useState(() => getAccountGreeting());
  useEffect(() => {
    const update = () => setGreeting(getAccountGreeting());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <span className="hd-account-greeting" title={`${greeting}, ${name}`}>
    <span className="hd-account-greeting__salutation">{greeting}</span>
    {logoUrl ? <img className="hd-account-greeting__logo" src={logoUrl} alt="" /> : <span className="hd-account-greeting__logo hd-account-greeting__monogram" aria-hidden="true">{String(companyName || name || 'HD').trim().slice(0, 1).toUpperCase()}</span>}
    <strong className="hd-account-greeting__name">{name}</strong>
  </span>;
}
