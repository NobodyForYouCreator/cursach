import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api';
import { Empty, ErrorAlert, Loading, StatusBadge, SuccessAlert } from '../components/ui';

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPurchases(await api('/purchases/my'));
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pay(purchaseId, success) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const purchase = await api(`/purchases/${purchaseId}/pay`, { method: 'POST', body: { success } });
      setNotice(purchase.status === 'paid' ? 'Покупка оплачена!' : 'Платёж отклонён.');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!purchases && !error) return <Loading />;

  return (
    <>
      <h1>Мои покупки</h1>
      <p className="muted">
        Здесь покупки текущего аккаунта. Бесплатные впечатления проходятся без покупки и в списке не отображаются.
      </p>
      <ErrorAlert error={error} />
      <SuccessAlert message={notice} />
      <div className="card">
        {purchases && purchases.length === 0 ? (
          <Empty>
            Покупок пока нет — загляните на <Link to="/showcase">витрину</Link>
          </Empty>
        ) : (
          purchases && (
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Впечатление</th>
                  <th>Цена на момент покупки</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td><Link to={`/impressions/${p.impression_id}`}>{p.impression_name || `Впечатление #${p.impression_id}`}</Link></td>
                    <td>{formatPrice(p.price_at_purchase)}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="muted small">{formatDate(p.created_at)}</td>
                    <td>
                      {p.status !== 'paid' ? (
                        <div className="btn-row">
                          <button className="btn success sm" disabled={busy} onClick={() => pay(p.id, true)}>Оплатить</button>
                          <button className="btn danger sm" disabled={busy} onClick={() => pay(p.id, false)}>Сбой оплаты</button>
                        </div>
                      ) : (
                        <Link className="btn secondary sm" to={`/impressions/${p.impression_id}/walk`}>Пройти</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </>
  );
}
