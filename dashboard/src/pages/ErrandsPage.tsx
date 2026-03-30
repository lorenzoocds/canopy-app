import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Errand {
  id: string;
  title: string;
  status: string;
  worker_id: string | null;
  pickup_window_start: string;
  pickup_window_end: string;
  payout_amount: number;
  item_description: string;
  quantity: number;
  pickup_address: string;
  dropoff_address: string;
  pickup_instructions: string;
  dropoff_instructions: string;
  pickup_photo_url: string | null;
  dropoff_photo_url: string | null;
  created_at: string;
}

const ErrandsPage: React.FC = () => {
  const [errands, setErrands] = useState<Errand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedErrand, setSelectedErrand] = useState<Errand | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    title: '',
    itemDescription: '',
    quantity: 1,
    pickupAddress: '',
    pickupLatitude: '',
    pickupLongitude: '',
    pickupWindowStart: '',
    pickupWindowEnd: '',
    pickupInstructions: '',
    dropoffAddress: '',
    dropoffLatitude: '',
    dropoffLongitude: '',
    dropoffInstructions: '',
  });

  useEffect(() => {
    fetchErrands();
  }, []);

  const fetchErrands = async () => {
    try {
      const { data, error } = await supabase
        .from('errands')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setErrands(data as Errand[]);
    } catch (err) {
      console.error('Error fetching errands:', err);
    } finally {
      setLoading(false);
    }
  };

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3958.8; // Earth's radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getDistanceMiles = (): number => {
    const pLat = parseFloat(formData.pickupLatitude);
    const pLng = parseFloat(formData.pickupLongitude);
    const dLat = parseFloat(formData.dropoffLatitude);
    const dLng = parseFloat(formData.dropoffLongitude);
    if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) return 0;
    return haversineDistance(pLat, pLng, dLat, dLng);
  };

  const calculatePayout = (): number => {
    const miles = getDistanceMiles();
    return Math.round((15 + miles * 0.5) * 100) / 100; // base $15 + $0.50/mile, rounded to 2 decimals
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) errors.title = 'Title is required';
    if (!formData.itemDescription.trim()) errors.itemDescription = 'Item description is required';
    if (formData.quantity <= 0) errors.quantity = 'Quantity must be greater than 0';
    if (!formData.pickupAddress.trim()) errors.pickupAddress = 'Pickup address is required';
    if (!formData.pickupLatitude || isNaN(parseFloat(formData.pickupLatitude))) errors.pickupLatitude = 'Valid pickup latitude is required';
    if (!formData.pickupLongitude || isNaN(parseFloat(formData.pickupLongitude))) errors.pickupLongitude = 'Valid pickup longitude is required';
    if (!formData.pickupWindowStart) errors.pickupWindowStart = 'Pickup window start is required';
    if (!formData.pickupWindowEnd) errors.pickupWindowEnd = 'Pickup window end is required';
    if (!formData.dropoffAddress.trim()) errors.dropoffAddress = 'Dropoff address is required';
    if (!formData.dropoffLatitude || isNaN(parseFloat(formData.dropoffLatitude))) errors.dropoffLatitude = 'Valid dropoff latitude is required';
    if (!formData.dropoffLongitude || isNaN(parseFloat(formData.dropoffLongitude))) errors.dropoffLongitude = 'Valid dropoff longitude is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleConfirmSubmitErrand = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      if (!userId) return;

      const distanceMiles = getDistanceMiles();
      const payout = calculatePayout();

      const { error } = await supabase.from('errands').insert({
        posted_by: userId,
        title: formData.title,
        item_description: formData.itemDescription,
        item_quantity: formData.quantity,
        pickup_address: formData.pickupAddress,
        pickup_latitude: parseFloat(formData.pickupLatitude),
        pickup_longitude: parseFloat(formData.pickupLongitude),
        pickup_window_start: formData.pickupWindowStart,
        pickup_window_end: formData.pickupWindowEnd,
        pickup_instructions: formData.pickupInstructions,
        dropoff_address: formData.dropoffAddress,
        dropoff_latitude: parseFloat(formData.dropoffLatitude),
        dropoff_longitude: parseFloat(formData.dropoffLongitude),
        dropoff_instructions: formData.dropoffInstructions,
        distance_miles: Math.round(distanceMiles * 100) / 100,
        payout_amount: payout,
        status: 'open',
      });

      if (error) throw error;

      fetchErrands();
      setShowConfirmation(false);
      setShowModal(false);
      setFormData({
        title: '',
        itemDescription: '',
        quantity: 1,
        pickupAddress: '',
        pickupLatitude: '',
        pickupLongitude: '',
        pickupWindowStart: '',
        pickupWindowEnd: '',
        pickupInstructions: '',
        dropoffAddress: '',
        dropoffLatitude: '',
        dropoffLongitude: '',
        dropoffInstructions: '',
      });
      setFormErrors({});
    } catch (err) {
      console.error('Error creating errand:', err);
    }
  };

  const handleSubmitErrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirmation(true);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Errands</h1>
        <button onClick={() => setShowModal(true)} style={styles.postButton}>
          Post New Errand
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Worker</th>
                <th style={styles.th}>Pickup Window</th>
                <th style={styles.th}>Payout</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {errands.map((errand) => (
                <tr
                  key={errand.id}
                  style={styles.row}
                  onClick={() => {
                    setSelectedErrand(errand);
                    setShowDetailModal(true);
                  }}
                >
                  <td style={styles.td}>{errand.title}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...getStatusBadgeColor(errand.status) }}>
                      {errand.status}
                    </span>
                  </td>
                  <td style={styles.td}>{errand.worker_id || '-'}</td>
                  <td style={styles.td}>
                    {new Date(errand.pickup_window_start).toLocaleDateString()} -{' '}
                    {new Date(errand.pickup_window_end).toLocaleDateString()}
                  </td>
                  <td style={styles.td}>${errand.payout_amount.toFixed(2)}</td>
                  <td style={styles.td}>
                    <button onClick={() => {}} style={styles.actionButton}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeButton} onClick={() => setShowModal(false)}>
              ×
            </button>
            <h2 style={styles.modalTitle}>Post New Errand</h2>

            <form onSubmit={handleSubmitErrand} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  style={{...styles.input, ...(formErrors.title ? styles.inputError : {})}}
                />
                {formErrors.title && <span style={styles.errorMessage}>{formErrors.title}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Item Description</label>
                <input
                  type="text"
                  value={formData.itemDescription}
                  onChange={(e) => setFormData({ ...formData, itemDescription: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Quantity</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Pickup Address</label>
                <input
                  type="text"
                  value={formData.pickupAddress}
                  onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.twoColumn}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Pickup Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.pickupLatitude}
                    onChange={(e) => setFormData({ ...formData, pickupLatitude: e.target.value })}
                    placeholder="e.g. 36.1627"
                    required
                    style={{...styles.input, ...(formErrors.pickupLatitude ? styles.inputError : {})}}
                  />
                  {formErrors.pickupLatitude && <span style={styles.errorMessage}>{formErrors.pickupLatitude}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Pickup Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.pickupLongitude}
                    onChange={(e) => setFormData({ ...formData, pickupLongitude: e.target.value })}
                    placeholder="e.g. -86.7816"
                    required
                    style={{...styles.input, ...(formErrors.pickupLongitude ? styles.inputError : {})}}
                  />
                  {formErrors.pickupLongitude && <span style={styles.errorMessage}>{formErrors.pickupLongitude}</span>}
                </div>
              </div>

              <div style={styles.twoColumn}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Pickup Window Start</label>
                  <input
                    type="datetime-local"
                    value={formData.pickupWindowStart}
                    onChange={(e) => setFormData({ ...formData, pickupWindowStart: e.target.value })}
                    required
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Pickup Window End</label>
                  <input
                    type="datetime-local"
                    value={formData.pickupWindowEnd}
                    onChange={(e) => setFormData({ ...formData, pickupWindowEnd: e.target.value })}
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Pickup Instructions</label>
                <textarea
                  value={formData.pickupInstructions}
                  onChange={(e) => setFormData({ ...formData, pickupInstructions: e.target.value })}
                  style={{ ...styles.input, minHeight: '80px' } as React.CSSProperties}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Dropoff Address</label>
                <input
                  type="text"
                  value={formData.dropoffAddress}
                  onChange={(e) => setFormData({ ...formData, dropoffAddress: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.twoColumn}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Dropoff Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.dropoffLatitude}
                    onChange={(e) => setFormData({ ...formData, dropoffLatitude: e.target.value })}
                    placeholder="e.g. 36.1745"
                    required
                    style={{...styles.input, ...(formErrors.dropoffLatitude ? styles.inputError : {})}}
                  />
                  {formErrors.dropoffLatitude && <span style={styles.errorMessage}>{formErrors.dropoffLatitude}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Dropoff Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.dropoffLongitude}
                    onChange={(e) => setFormData({ ...formData, dropoffLongitude: e.target.value })}
                    placeholder="e.g. -86.7679"
                    required
                    style={{...styles.input, ...(formErrors.dropoffLongitude ? styles.inputError : {})}}
                  />
                  {formErrors.dropoffLongitude && <span style={styles.errorMessage}>{formErrors.dropoffLongitude}</span>}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Dropoff Instructions</label>
                <textarea
                  value={formData.dropoffInstructions}
                  onChange={(e) => setFormData({ ...formData, dropoffInstructions: e.target.value })}
                  style={{ ...styles.input, minHeight: '80px' } as React.CSSProperties}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Calculated Distance &amp; Payout</label>
                <div style={styles.calculatedInfo}>
                  <p style={styles.hint}>
                    Distance: {getDistanceMiles() > 0 ? `${getDistanceMiles().toFixed(2)} miles` : 'Enter coordinates above'}
                  </p>
                  <p style={{...styles.hint, fontWeight: '600', color: '#388e3c'}}>
                    Payout: ${calculatePayout().toFixed(2)} (base $15.00 + $0.50/mile)
                  </p>
                </div>
              </div>

              <button type="submit" style={styles.submitButton}>
                Post Errand
              </button>
            </form>
          </div>
        </div>
      )}

      {showConfirmation && (
        <div style={styles.modalOverlay} onClick={() => setShowConfirmation(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Confirm Errand</h2>
            <p style={styles.confirmText}>Are you sure you want to post this errand?</p>
            <p style={styles.payoutText}>
              Distance: {getDistanceMiles().toFixed(2)} miles | Payout: ${calculatePayout().toFixed(2)}
            </p>
            <div style={styles.modalActions}>
              <button onClick={() => setShowConfirmation(false)} style={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={handleConfirmSubmitErrand} style={{...styles.actionBtn, ...styles.primaryBtn}}>
                Confirm & Post
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedErrand && (
        <div style={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeButton} onClick={() => setShowDetailModal(false)}>
              ×
            </button>
            <h2 style={styles.modalTitle}>Errand Details</h2>

            <div style={styles.modalContent}>
              <h3>{selectedErrand.title}</h3>
              <p>
                <strong>Status:</strong> {selectedErrand.status}
              </p>
              <p>
                <strong>Item:</strong> {selectedErrand.item_description} (Qty: {selectedErrand.quantity})
              </p>
              <p>
                <strong>Pickup Address:</strong> {selectedErrand.pickup_address}
              </p>
              <p>
                <strong>Pickup Instructions:</strong> {selectedErrand.pickup_instructions}
              </p>
              <p>
                <strong>Dropoff Address:</strong> {selectedErrand.dropoff_address}
              </p>
              <p>
                <strong>Dropoff Instructions:</strong> {selectedErrand.dropoff_instructions}
              </p>
              <p>
                <strong>Payout:</strong> ${selectedErrand.payout_amount.toFixed(2)}
              </p>

              <div style={styles.photoSection}>
                {selectedErrand.pickup_photo_url && (
                  <div style={styles.photoBox}>
                    <p style={styles.photoLabel}>Pickup Photo</p>
                    <img src={selectedErrand.pickup_photo_url} alt="Pickup" style={styles.photo} />
                  </div>
                )}
                {selectedErrand.dropoff_photo_url && (
                  <div style={styles.photoBox}>
                    <p style={styles.photoLabel}>Dropoff Photo</p>
                    <img src={selectedErrand.dropoff_photo_url} alt="Dropoff" style={styles.photo} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getStatusBadgeColor = (status: string): React.CSSProperties => {
  const colors: Record<string, { backgroundColor: string; color: string }> = {
    posted: { backgroundColor: '#e3f2fd', color: '#0d47a1' },
    in_progress: { backgroundColor: '#fff3cd', color: '#856404' },
    completed: { backgroundColor: '#d4edda', color: '#155724' },
  };
  return colors[status] || { backgroundColor: '#e2e3e5', color: '#383d41' };
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '30px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
  },
  postButton: {
    padding: '10px 16px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  tableWrapper: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    overflow: 'x',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  headerRow: {
    backgroundColor: '#f5f5f5',
    borderBottom: '2px solid #ddd',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  row: {
    borderBottom: '1px solid #ddd',
    cursor: 'pointer',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#333',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  actionButton: {
    padding: '6px 12px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#666',
  },
  modalTitle: {
    margin: '0 0 20px 0',
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  formGroup: {
    marginBottom: '16px',
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
    fontSize: '14px',
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#d32f2f',
    backgroundColor: '#fff5f5',
  },
  errorMessage: {
    color: '#d32f2f',
    fontSize: '12px',
    marginTop: '4px',
    display: 'block',
  },
  hint: {
    margin: '4px 0 0 0',
    fontSize: '12px',
    color: '#666',
  },
  calculatedInfo: {
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
  submitButton: {
    padding: '12px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  photoSection: {
    display: 'flex',
    gap: '20px',
    marginTop: '20px',
  },
  photoBox: {
    flex: 1,
  },
  photoLabel: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
  },
  photo: {
    width: '100%',
    height: '200px',
    objectFit: 'cover',
    borderRadius: '4px',
  },
  loading: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#666',
  },
  confirmText: {
    fontSize: '16px',
    margin: '16px 0',
    color: '#333',
  },
  payoutText: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#388e3c',
    margin: '12px 0',
  },
  cancelButton: {
    padding: '10px 16px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  actionBtn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: '#388e3c',
    color: 'white',
  },
};

export default ErrandsPage;
