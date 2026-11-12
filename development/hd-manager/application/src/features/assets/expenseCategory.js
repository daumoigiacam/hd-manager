export const normalizeCategorySearch = value => `${value || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const isFuelExpenseCategory = value => /^(?:(?:chi|do|mua|chi phi) )?(?:xang(?: dau)?|dau diesel|nhien lieu|fuel)$/.test(normalizeCategorySearch(value));

export function changeExpenseCategory(previous, category) {
  return { ...previous, category, assetId: isFuelExpenseCategory(category) ? previous.assetId || '' : '' };
}

export function searchExpenseCategories(options, query) {
  const needle = normalizeCategorySearch(query);
  return options.map((label, index) => {
    const key = normalizeCategorySearch(label);
    return { label, index, rank: key === needle ? 0 : key.startsWith(needle) ? 1 : 2, matches: needle.split(' ').every(word => key.includes(word)) };
  }).filter(row => row.matches).sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, 30).map(row => row.label);
}
