import { useEffect, useState } from 'react';
import { api } from './api';

// Города, в которых есть хотя бы одно опубликованное впечатление.
export function useActiveCities() {
  const [cities, setCities] = useState([]);
  useEffect(() => {
    let alive = true;
    api('/showcase/cities', { auth: false })
      .then((items) => alive && setCities(items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return cities;
}
