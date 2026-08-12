import React from 'react';

const HistoryTable = ({ history, onLoadSimulation }) => {
  if (!history || history.length === 0) {
    return (
      <div className="card history-card">
        <h3 className="card-title">Simulation History</h3>
        <p className="empty-text">No simulation history saved yet.</p>
      </div>
    );
  }

  return (
    <div className="card history-card">
      <h3 className="card-title">Saved Simulation History</h3>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Type</th>
              <th>S₀</th>
              <th>K</th>
              <th>σ</th>
              <th>Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 10).map((item) => (
              <tr key={item._id || item.id}>
                <td>{new Date(item.createdAt || Date.now()).toLocaleDateString()}</td>
                <td>{item.name || 'Simulation'}</td>
                <td><span className="badge badge-info">{item.simulationType || 'European'}</span></td>
                <td>${item.parameters?.S0}</td>
                <td>${item.parameters?.K}</td>
                <td>{item.parameters?.sigma}</td>
                <td className="font-numeric">${item.result?.optionPrice?.toFixed(2)}</td>
                <td>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => onLoadSimulation(item)}
                  >
                    Load
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryTable;
