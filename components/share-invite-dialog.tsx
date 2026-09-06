'use client';

import { Check, Copy, Link2, Share2, Smartphone, X } from 'lucide-react';
import { useState } from 'react';

export type ShareInviteDevice = {
  deviceId: string;
  deviceLabel: string;
  slotStatus: string;
};

export function ShareInviteDialog({
  title,
  description,
  valueLabel,
  displayValue,
  copyValue,
  whatsappMessage,
  valueStyle = 'code',
  devices,
  expiryLabel,
  onClose,
}: {
  title: string;
  description: string;
  valueLabel: string;
  displayValue: string;
  copyValue: string;
  whatsappMessage: string;
  valueStyle?: 'code' | 'link';
  devices?: ShareInviteDevice[];
  expiryLabel?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <span className="dialog-icon"><Link2 size={23} /></span>
        <h2 id="share-title">{title}</h2>
        <p>{description}</p>
        {expiryLabel && <p className="invite-expiry">{expiryLabel}</p>}
        <div className={valueStyle === 'link' ? 'share-code share-code-link' : 'share-code'}>
          <span>{valueLabel}</span>
          <strong>{displayValue}</strong>
        </div>
        <div className="share-actions">
          <button className="primary-button" onClick={copy}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied' : 'Copy invite'}
          </button>
          <a
            className="whatsapp-button"
            href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Share2 size={18} /> WhatsApp
          </a>
        </div>
        {devices && devices.length > 0 && (
          <div className="device-slots">
            {devices.map((device) => (
              <div key={device.deviceId}>
                <Smartphone size={17} />
                <span>
                  <strong>{device.deviceLabel}</strong>
                  <small>{device.slotStatus}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
