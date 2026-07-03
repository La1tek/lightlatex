(function () {
  window.LightTeXCore = window.LightTeXCore || {};

  function formatHash(hash) {
    return hash ? `${hash.slice(0, 12)}...` : 'missing';
  }

  function formatAuthors(author) {
    if (!author) return 'Unknown author';
    const authors = author.split(/\s+and\s+/i);
    return authors
      .slice(0, 3)
      .map((name) => name.includes(',') ? name.split(',')[0].trim() : name.trim().split(/\s+/).slice(-1)[0])
      .join(', ') + (authors.length > 3 ? ' et al.' : '');
  }

  function parseSnapshotDate(timestamp) {
    const match = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/);
    if (!match) return null;
    const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatSnapshotDate(timestamp) {
    const parsed = parseSnapshotDate(timestamp);
    return parsed ? parsed.toLocaleString() : timestamp;
  }

  function formatSnapshotLabel(snapshot) {
    const timestamp = typeof snapshot === 'string' ? snapshot : snapshot.timestamp;
    if (typeof snapshot === 'object' && snapshot.name) return snapshot.name;
    const parsed = parseSnapshotDate(timestamp);
    if (!parsed) return timestamp;
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function snapshotMessage(snapshot, index) {
    if (typeof snapshot === 'object' && snapshot.message) return snapshot.message;
    const timestamp = typeof snapshot === 'string' ? snapshot : snapshot.timestamp;
    if (typeof snapshot === 'object' && snapshot.type === 'manual') return formatSnapshotDate(timestamp);
    if (index === 0) return 'Latest successful compile';
    const parsed = parseSnapshotDate(timestamp);
    return parsed ? `Compile #${index + 1}` : timestamp;
  }

  window.LightTeXCore.format = {
    formatAuthors,
    formatHash,
    formatSnapshotDate,
    formatSnapshotLabel,
    parseSnapshotDate,
    snapshotMessage,
  };
})();
