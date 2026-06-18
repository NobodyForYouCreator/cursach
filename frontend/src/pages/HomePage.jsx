import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useActiveCities } from '../hooks';
import { CitySelect, Empty, ErrorAlert, ImpressionCard, Loading } from '../components/ui';

export default function HomePage() {
  const { user } = useAuth();
  const cities = useActiveCities();
  const [city, setCity] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api('/bff/home', { params: { city_external_id: city, page_size: 12 } }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-title">
        <h1>Откройте город заново</h1>
        <label className="field" style={{ minWidth: 200 }}>
          <CitySelect value={city} onChange={setCity} cities={cities} />
        </label>
      </div>
      <p className="muted">
        Авторские маршруты-впечатления по городам России: выбирайте, проходите и делитесь отзывами.
      </p>
      <ErrorAlert error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <h2>Витрина</h2>
            {data.showcase.length === 0 ? (
              <Empty>Пока нет опубликованных впечатлений</Empty>
            ) : (
              <div className="grid-cards">
                {data.showcase.map((imp) => (
                  <ImpressionCard key={imp.id} imp={imp} />
                ))}
              </div>
            )}
            {user && (
              <>
                <h2 style={{ marginTop: 32 }}>Рекомендации для вас</h2>
                {data.recommendations.length === 0 ? (
                  <Empty>Рекомендаций пока нет</Empty>
                ) : (
                  <div className="grid-cards">
                    {data.recommendations.map((imp) => (
                      <ImpressionCard key={imp.id} imp={imp} showScore />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
    </>
  );
}
