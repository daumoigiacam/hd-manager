// Loading code is separate from granting access or opening a repository.
// Only an explicit, currently permitted navigation intent can start an import.
export function prepareNavigationModule(tab, { modules, canAccess }) {
  if (typeof tab !== 'string' || !Object.hasOwn(modules, tab) || canAccess(tab) !== true) return false;
  void modules[tab].preload().catch(() => {
    // The view owns the visible error and explicit retry. Never reload a page
    // here: a user may have an unsaved form in the currently displayed module.
  });
  return true;
}

export function navigationIntentTab(target) {
  const element = target?.closest?.('[data-hd-navigation-tab], [data-home-module], [data-hd-more-module]');
  if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return null;
  return element.getAttribute('data-hd-navigation-tab')
    || element.getAttribute('data-home-module') || element.getAttribute('data-hd-more-module');
}
