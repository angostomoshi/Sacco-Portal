import React from 'react';

const alertMeta = {
  info: {
    icon: 'i',
    title: 'Note'
  },
  success: {
    icon: '✓',
    title: 'Success'
  },
  warning: {
    icon: '!',
    title: 'Attention'
  },
  error: {
    icon: '⚠',
    title: 'Alert'
  }
};

const Alert = ({ type = 'info', title, children, actionLabel, onAction, className = '' }) => {
  const meta = alertMeta[type] || alertMeta.info;

  return (
    <div className={`app-alert app-alert-${type} ${className}`} role={type === 'error' ? 'alert' : 'status'}>
      <div className="app-alert-icon">{meta.icon}</div>
      <div className="app-alert-content">
        <strong>{title || meta.title}</strong>
        <p>{children}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" className="app-alert-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default Alert;
