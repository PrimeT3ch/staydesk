import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Lozenge,
  SectionMessage,
  Select,
  Stack,
  Text,
  Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const URGENCY_APPEARANCE = { High: 'removed', Medium: 'moved', Low: 'default' };

const toOptions = (list) => list.map((item) => ({ label: item, value: item }));

const App = () => {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // "Add unit" form
  const [unitName, setUnitName] = useState('');
  const [unitFormKey, setUnitFormKey] = useState(0);

  // "Log request" form
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState('');
  const [urgency, setUrgency] = useState('');
  const [title, setTitle] = useState('');
  const [requestFormKey, setRequestFormKey] = useState(0);

  // Sends a request to the backend and shows the refreshed data or the error.
  const run = async (functionKey, payload, onSuccess) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await invoke(functionKey, payload);
      if (response && response.ok) {
        setView(response.view);
        if (onSuccess) onSuccess();
      } else {
        setError((response && response.error) || 'Something went wrong. Please try again.');
      }
    } catch (e) {
      setError('Could not reach the StayDesk backend. Please refresh the page and try again.');
    }
    setBusy(false);
  };

  useEffect(() => {
    run('getData', {});
  }, []);

  const handleAddUnit = () =>
    run('addUnit', { name: unitName }, () => {
      setNotice(`Unit "${unitName.trim()}" added.`);
      setUnitName('');
      setUnitFormKey((k) => k + 1);
    });

  const handleAddRequest = () =>
    run('addRequest', { unitId, category, urgency, title }, () => {
      setNotice('Repair request logged.');
      setUnitId('');
      setCategory('');
      setUrgency('');
      setTitle('');
      setRequestFormKey((k) => k + 1);
    });

  const handleStatus = (id, status) => run('setStatus', { id, status });

  if (!view) {
    return (
      <Stack space="space.200">
        <Heading size="large">StayDesk</Heading>
        {error ? (
          <SectionMessage appearance="error" title="StayDesk could not load">
            <Text>{error}</Text>
          </SectionMessage>
        ) : (
          <Text>Loading your units and requests...</Text>
        )}
      </Stack>
    );
  }

  const hasUnits = view.units.length > 0;

  const tableHead = {
    cells: [
      { key: 'unit', content: 'Unit' },
      { key: 'issue', content: 'Problem' },
      { key: 'category', content: 'Category' },
      { key: 'urgency', content: 'Urgency' },
      { key: 'logged', content: 'Logged' },
      { key: 'action', content: 'Status' },
    ],
  };

  const tableRows = view.requests.map((r) => ({
    key: r.id,
    cells: [
      { key: 'unit', content: <Text>{r.unitName}</Text> },
      {
        key: 'issue',
        content: (
          <Inline space="space.100" alignBlock="center">
            <Text>{r.title}</Text>
            {r.isRepeat && r.status === 'Open' ? (
              <Lozenge appearance="danger" isBold>
                {`Repeat fault x${r.repeatCount}`}
              </Lozenge>
            ) : null}
          </Inline>
        ),
      },
      { key: 'category', content: <Text>{r.category}</Text> },
      {
        key: 'urgency',
        content: <Lozenge appearance={URGENCY_APPEARANCE[r.urgency]}>{r.urgency}</Lozenge>,
      },
      { key: 'logged', content: <Text>{r.createdAt.slice(0, 10)}</Text> },
      {
        key: 'action',
        content:
          r.status === 'Open' ? (
            <Button isDisabled={busy} onClick={() => handleStatus(r.id, 'Resolved')}>
              Mark resolved
            </Button>
          ) : (
            <Inline space="space.100" alignBlock="center">
              <Lozenge appearance="success">Resolved</Lozenge>
              <Button appearance="subtle" isDisabled={busy} onClick={() => handleStatus(r.id, 'Open')}>
                Reopen
              </Button>
            </Inline>
          ),
      },
    ],
  }));

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="large">StayDesk</Heading>
        <Text>
          {`${view.summary.units} units | ${view.summary.open} open requests | ${view.summary.repeats} repeat faults`}
        </Text>
      </Stack>

      {error ? (
        <SectionMessage appearance="error" title="That did not work">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
      {notice ? (
        <SectionMessage appearance="success">
          <Text>{notice}</Text>
        </SectionMessage>
      ) : null}

      <Stack space="space.100" key={`unit-form-${unitFormKey}`}>
        <Heading size="medium">1. Add a unit</Heading>
        <Label labelFor="unit-name">Unit name</Label>
        <Textfield
          id="unit-name"
          placeholder="For example: Maitama 2B"
          maxLength={60}
          onChange={(e) => setUnitName(e.target.value)}
        />
        <Inline>
          <Button appearance="primary" isDisabled={busy} onClick={handleAddUnit}>
            Add unit
          </Button>
        </Inline>
      </Stack>

      {hasUnits ? (
        <Stack space="space.100" key={`request-form-${requestFormKey}`}>
          <Heading size="medium">2. Log a repair request</Heading>
          <Label labelFor="request-unit">Unit</Label>
          <Select
            id="request-unit"
            placeholder="Choose a unit"
            options={view.units.map((u) => ({ label: u.name, value: u.id }))}
            onChange={(opt) => setUnitId(opt ? opt.value : '')}
          />
          <Label labelFor="request-category">Category</Label>
          <Select
            id="request-category"
            placeholder="Choose a category"
            options={toOptions(view.categories)}
            onChange={(opt) => setCategory(opt ? opt.value : '')}
          />
          <Label labelFor="request-urgency">Urgency</Label>
          <Select
            id="request-urgency"
            placeholder="Choose an urgency"
            options={toOptions(view.urgencies)}
            onChange={(opt) => setUrgency(opt ? opt.value : '')}
          />
          <Label labelFor="request-title">What is wrong?</Label>
          <Textfield
            id="request-title"
            placeholder="For example: Bathroom sink is leaking"
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Inline>
            <Button appearance="primary" isDisabled={busy} onClick={handleAddRequest}>
              Log request
            </Button>
          </Inline>
        </Stack>
      ) : (
        <SectionMessage appearance="information" title="Add your first unit">
          <Text>Once you add a unit, you can start logging repair requests for it.</Text>
        </SectionMessage>
      )}

      <Stack space="space.100">
        <Heading size="medium">Requests</Heading>
        <Text>
          Open requests are listed first, most urgent at the top. A request is flagged as a repeat
          fault when the same unit has had the same kind of problem at least twice in 90 days.
        </Text>
        <DynamicTable
          head={tableHead}
          rows={tableRows}
          rowsPerPage={8}
          emptyView={<Text>No requests yet.</Text>}
        />
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
