import { useEffect, useState } from 'react';
import { getAccountGreeting } from '../utils/accountGreeting.js';
import './account-greeting.css';

export default function AccountGreeting({ name }) {
  const [greeting, setGreeting] = useState(() => getAccountGreeting());
  useEffect(() => {
    const update = () => setGreeting(getAccountGreeting());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <span className="hd-account-greeting" title={`${greeting}, ${name}`}>
    <span className="hd-account-greeting__salutation">{greeting}</span>
    <span aria-hidden="true">-</span>
    <span className="hd-account-greeting__name">{name}</span>
  </span>;
}
