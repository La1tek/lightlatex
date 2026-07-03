(function () {
  window.LightTeXCore = window.LightTeXCore || {};

  function canEdit(role) {
    return ['owner', 'editor'].includes(role || 'owner');
  }

  function canManage(role) {
    return (role || 'owner') === 'owner';
  }

  function roleLabel(role = 'owner') {
    return role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer';
  }

  window.LightTeXCore.permissions = {
    canEdit,
    canManage,
    roleLabel,
  };
})();
