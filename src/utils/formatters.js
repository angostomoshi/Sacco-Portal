export const formatPayMode = (mode) => {
  if (!mode) return '';

  const normalized = String(mode).trim();
  if (!normalized) return '';
  if (normalized === 'N/A') return 'N/A';
  if (normalized.toLowerCase() === 'checkoff') return 'Check off';

  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};
