import React from 'react';

function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const HistoryTable = ({ history, onLoadSimulation, onDeleteSimulation, loading }) => {
  if (!history || history.length === 0) {
    return (
      <div className="card history-card" style={{ border: '1px solid #27272a', padding: '24px' }}>
        <h3 className="card-title" style={{ color: '#60a5fa', margin: '0 0 12px' }}>Saved Simulation History</h3>
        <p className="empty-text" style={{ color: '#cbd5e1', margin: 0, fontSize: '0.92rem' }}>
          No simulation runs saved in MongoDB yet. Run a simulation and click <strong>"Save Run to MongoDB"</strong> to persist results.
        </p>
      </div>
    );
  }

  return (
    <div className="card history-card" style={{ border: '1px solid #27272a', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 className="card-title" style={{ color: '#60a5fa', margin: 0 }}>Saved Simulation History ({history.length})</h3>
        {loading && <span style={{ color: '#38bdf8', fontSize: '0.85rem' }}>Updating…</span>}
      </div>

      <div className="table-responsive">
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #27272a', color: '#cbd5e1', fontSize: '0.88rem' }}>
              <th style={{ padding: '8px' }}>Saved</th>
              <th style={{ padding: '8px' }}>Name / Ticker</th>
              <th style={{ padding: '8px' }}>Type</th>
              <th style={{ padding: '8px' }}>Spot (S₀)</th>
              <th style={{ padding: '8px' }}>Strike (K)</th>
              <th style={{ padding: '8px' }}>Vol (σ)</th>
              <th style={{ padding: '8px' }}>Fair Value</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => {
              const type = item.simulationType || 'european';
              const badgeBg =
                type === 'delta-hedge' ? 'rgba(168, 85, 247, 0.2)' :
                type === 'asian' ? 'rgba(59, 130, 246, 0.2)' :
                type === 'greeks' ? 'rgba(234, 179, 8, 0.2)' :
                'rgba(34, 197, 94, 0.2)';
              const badgeColor =
                type === 'delta-hedge' ? '#c084fc' :
                type === 'asian' ? '#60a5fa' :
                type === 'greeks' ? '#facc15' :
                '#4ade80';

              const price = item.result?.optionPrice != null ? `$${item.result.optionPrice.toFixed(2)}` : '—';

              return (
                <tr key={item._id || item.id} style={{ borderBottom: '1px solid #0f172a', fontSize: '0.88rem' }}>
                  <td style={{ padding: '8px', color: '#94a3b8' }}>{formatTimestamp(item.createdAt)}</td>
                  <td style={{ padding: '8px', fontWeight: 600, color: '#f8fafc' }}>
                    {item.name || `${item.symbol || 'AAPL'} Run`}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ background: badgeBg, color: badgeColor, padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
                      {type}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>${item.parameters?.S0 ?? '—'}</td>
                  <td style={{ padding: '8px' }}>${item.parameters?.K ?? '—'}</td>
                  <td style={{ padding: '8px' }}>{item.parameters?.sigma ? `${(item.parameters.sigma * 100).toFixed(0)}%` : '—'}</td>
                  <td style={{ padding: '8px', color: '#38bdf8', fontWeight: 700 }}>{price}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        className="btn btn-xs"
                        onClick={() => onLoadSimulation && onLoadSimulation(item)}
                        style={{ background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                        title="Load parameters into simulator"
                      >
                        Load
                      </button>
                      {onDeleteSimulation && (
                        <button
                          className="btn btn-xs"
                          onClick={() => onDeleteSimulation(item._id || item.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #7f1d1d', color: '#f87171', padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                          title="Delete from MongoDB"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryTable;
