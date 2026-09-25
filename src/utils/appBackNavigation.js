export function getAppBackTab({ currentTab = 'home', tabHistory = [], lastNonDebtTab = 'more', canAccess = () => true } = {}) {
  if (tabHistory.length > 0) return tabHistory[tabHistory.length - 1] || 'home';
  if (currentTab === 'home') return null;
  if (currentTab === 'debt') {
    return lastNonDebtTab && lastNonDebtTab !== 'debt' && canAccess(lastNonDebtTab)
      ? lastNonDebtTab
      : 'more';
  }
  return 'home';
}
