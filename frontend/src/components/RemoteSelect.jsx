import { useCallback, useEffect, useRef, useState } from 'react';
import { Select, Spin } from 'antd';
import api from '../api';

// Resources with a lightweight /lookup endpoint (names only, open to every signed-in user), so a picker
// works even when the user has no permission for the related page itself.
const LOOKUPS = ['students', 'faculty', 'courses', 'users'];

/**
 * Select whose options come from a CRUD resource, searched server-side as the user types.
 * `initialOptions` lets an edit form show the label of the current value before any search.
 */
export default function RemoteSelect({ resource, labelOf, params, initialOptions = [], pageSize = 30, ...props }) {
  const [options, setOptions] = useState(initialOptions);
  const [loading, setLoading] = useState(false);
  const timer = useRef();
  const requestId = useRef(0);
  const valueRef = useRef(props.value);
  valueRef.current = props.value;
  const paramsKey = JSON.stringify(params || {});

  const load = useCallback(
    (q) => {
      const id = ++requestId.current;
      setLoading(true);
      api
        .get(LOOKUPS.includes(resource) ? `/lookup/${resource}` : `/${resource}`, { params: { ...JSON.parse(paramsKey), q: q || undefined, pageSize } })
        .then(({ data }) => {
          if (id !== requestId.current) return;
          const fetched = data.items.map((item) => ({ value: item._id, label: labelOf(item) }));
          // Keep the currently selected option so its label survives a search that excludes it.
          setOptions((prev) => [
            ...prev.filter((o) => o.value === valueRef.current && !fetched.some((f) => f.value === o.value)),
            ...fetched,
          ]);
        })
        .catch(() => {})
        .finally(() => id === requestId.current && setLoading(false));
    },
    // labelOf is usually an inline function; it only formats labels, so it is left out on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resource, paramsKey, pageSize]
  );

  useEffect(() => {
    load('');
    return () => clearTimeout(timer.current);
  }, [load]);

  const onSearch = (q) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), 300);
  };

  return (
    <Select
      showSearch
      filterOption={false}
      onSearch={onSearch}
      options={options}
      notFoundContent={loading ? <Spin size="small" /> : undefined}
      {...props}
    />
  );
}
