import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Container } from '@/components/container';
import { useSettings } from '@/providers';
import { toAbsoluteUrl } from '@/utils';
import ReactDOM from 'react-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type WorldCountry = {
  CountryID: number;
  CountryName: string;
  ISO2?: string | null;
  ISO3?: string | null;
};

type WorldCurrency = {
  CurrencyID: number;
  CurrencyName: string;
  CurrencyCode: string;
  CurrencySymbol?: string | null;
};

type WorldCountryCurrency = {
  CountryID: number;
  CurrencyID: number;
  IsPrimary: boolean;
};

const currencySchema = z.object({
  CurrencyCode: z.string().min(1, 'Currency Code is required'),
  CurrencyName: z.string().min(1, 'Currency Name is required'),
  Symbol: z.string().optional(),
  Country: z.string().optional(),
  DecimalPlaces: z.number().min(0).max(4),
  IsActive: z.boolean()
});

const CurrencyManagement = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();
  const { getThemeMode } = useSettings();
  const [tableLoading, setTableLoading] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [editStep, setEditStep] = useState(1);

  // const currencyForm = useForm<z.infer<typeof currencySchema>>({
  //   resolver: zodResolver(currencySchema),
  //   defaultValues: {
  //     CurrencyCode: '',
  //     CurrencyName: '',
  //     Symbol: '',
  //     Country: '',
  //     DecimalPlaces: 2,
  //     IsActive: true
  //   }
  // });

  const createCurrencyForm = useForm({
  resolver: zodResolver(currencySchema),
  defaultValues: {
    CurrencyCode: "",
    CurrencyName: "",
    Symbol: "",
    Country: "",
    DecimalPlaces: 2,
    IsActive: true,
  }
});

const editCurrencyForm = useForm({
  resolver: zodResolver(currencySchema),
  defaultValues: {
    CurrencyCode: "",
    CurrencyName: "",
    Symbol: "",
    Country: "",
    DecimalPlaces: 2,
    IsActive: true,
  }
});

  const { data: currencies = [], refetch } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const res = await fetch('/api/framework/currencies');

      return res.json();
    }
  });

  const { data: worldCountries = [] } = useQuery({
    queryKey: ['world-countries'],
    queryFn: async () => {
      const res = await fetch('/api/framework/world-countries');
      if (!res.ok) throw new Error('Failed to fetch world countries');
      return res.json();
    }
  });

  const { data: worldCurrencies = [] } = useQuery({
    queryKey: ['world-currencies'],
    queryFn: async () => {
      const res = await fetch('/api/framework/world-currencies');
      if (!res.ok) throw new Error('Failed to fetch world currencies');
      return res.json();
    }
  });

  const { data: worldCountryCurrencies = [] } = useQuery({
    queryKey: ['world-country-currencies'],
    queryFn: async () => {
      const res = await fetch('/api/framework/world-country-currencies');
      if (!res.ok) throw new Error('Failed to fetch world country currencies');
      return res.json();
    }
  });

  const createCurrencyMutation = useMutation({
    mutationFn: async (data: any) => {
      await fetch('/api/framework/currencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success('Currency Added Successfully');
      createCurrencyForm.reset();
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: () => {
      toast.error('Failed to add currency');
    }
  });

  const updateCurrencyMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      await fetch(`/api/framework/currencies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success(' Currency Updated Successfully');
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: () => {
      toast.error('Failed to Update Currency');
    }
  });

  const deleteCurrencyMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/framework/currencies/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success('Currency Deleted Successfully');
      refetch();
    },
    onError: () => {
      toast.error('Failed to delete Currency');
    }
  });

  const openEditDialog = (currency: any) => {
    setEditingCurrency(currency);
    editCurrencyForm.reset(currency);
    setEditStep(1);
    setIsEditDialogOpen(true);
  };

  const onSubmit = (data: any) => createCurrencyMutation.mutate(data);
  const onUpdate = (data: any) =>
    updateCurrencyMutation.mutate({ id: editingCurrency.CurrencyID, data });

  const filteredCurrencies = currencies.filter((cur: any) => {
    const matchesSearch =
      cur.CurrencyCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cur.CurrencyName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && cur.IsActive) ||
      (statusFilter === 'inactive' && !cur.IsActive);

    return matchesSearch && matchesStatus;
  });
  const onCancel = () => {
    setIsCreateDialogOpen(false);
  };
  const onEditCancel = () => {
    setIsEditDialogOpen(false);
  };

  useEffect(() => {
    if (isCreateDialogOpen) setCreateStep(1);
  }, [isCreateDialogOpen]);
  return (
    <div className="w-full p-6 space-y-6 card">
      <div>
        <h2 className="text-2xl font-bold dark:text-white">Currency Management</h2>
        <p className="text-md text-gray-500 dark:text-gray-700">Manage Currency & Symbols</p>
      </div>

      <div
        className="bg-center bg-cover bg-no-repeat hero-bg"
        style={{
          backgroundImage:
            getThemeMode() === 'dark'
              ? `url('${toAbsoluteUrl('/media/images/2600x1200/bg-1-dark.png')}')`
              : `url('${toAbsoluteUrl('/media/images/2600x1200/bg-1.png')}')`
        }}
      >
        <Container>
          <div className="flex flex-col items-center gap-2 py-8">
            <img src={toAbsoluteUrl('/media/FrameWorkImage/Currency.png')} className="h-[90px]" />
            <p className="font-bold text-xl dark:text-white">
              Total Currencies: <span>{currencies.length}</span>
            </p>
          </div>
        </Container>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="input input-md w-44 md:w-60 border hover:border-blue-400 border-blue-300 text-xs md:text-md">
            <i className="ki-filled ki-magnifier"></i>
            <input
              placeholder="Search currencies"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="sm:size-sm text-xs w-36 md:text-md md:w-44 btn-outline btn-primary border hover:border-blue-400"
              size="md"
            >
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent className="w-36 md:w-44">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline btn-primary flex items-center gap-2 text-xs md:text-md"
            onClick={async () => {
              setTableLoading(true);

              await queryClient.invalidateQueries({ queryKey: ['currencies'] });

              setTimeout(() => {
                setTableLoading(false);
                toast.success('Currencies refreshed');
              }, 400);
            }}
          >
            <RefreshCw className={`h-3 w-3 md:h-5 md:w-5 ${tableLoading ? 'animate-spin' : ''}`} />
            {tableLoading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            className="btn btn-primary btn-outline flex items-center gap-2 text-xs md:text-md"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <i className="ki-solid ki-plus"></i>
            Add New
          </button>
        </div>
      </div>
      {/* Table */}
      <div className="grid">
        <div className="card min-w-full">
          <div className="card-table scrollable-x-auto">
            <table className="table min-w-full table-auto">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-7">Code</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Symbol</th>
                  <th className="px-3 py-3">Country</th>
                  <th className="px-3 py-3">Decimals</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin inline-block" />
                    </td>
                  </tr>
                ) : (
                  filteredCurrencies.map((cur: any, i: number) => (
                    <tr
                      key={i}
                      className={`text-left ${i % 2 === 0 ? '' : 'bg-gray-100'} hover:bg-gray-100`}
                    >
                      <td className="px-3 py-3">{cur.CurrencyCode}</td>
                      <td className="px-3 py-3">{cur.CurrencyName}</td>
                      <td className="px-3 py-3">{cur.Symbol}</td>
                      <td className="px-3 py-3">{cur.Country}</td>
                      <td className="px-3 py-3">{cur.DecimalPlaces}</td>

                      <td className="px-3 py-3">
                        <span
                          className={`badge px-2 py-1 rounded-full text-white font-bold ${
                            cur.IsActive ? 'bg-success' : 'bg-danger'
                          }`}
                        >
                          {cur.IsActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                        <button
                          className="text-warning"
                          title="Edit"
                          onClick={() => openEditDialog(cur)}
                        >
                          <i className="ki-filled ki-notepad-edit text-lg"></i>
                        </button>

                        <button
                          className="text-danger"
                          title="Delete"
                          onClick={() => deleteCurrencyMutation.mutate(cur.CurrencyID)}
                        >
                          <i className="ki-filled ki-trash text-lg"></i>
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/*  Create Dialog */}
      {isCreateDialogOpen && (
        <Dialog title="Add Currency" onClose={() => setIsCreateDialogOpen(false)} className="h-[540px]">
          <CurrencyForm
            form={createCurrencyForm}
            onSubmit={onSubmit}
            onCancel={onCancel}
            step={createStep}
            onPrev={() => setCreateStep(1)}
            onNext={() => setCreateStep(2)}
            worldCountries={worldCountries}
            worldCurrencies={worldCurrencies}
            worldCountryCurrencies={worldCountryCurrencies}
          />
        </Dialog>
      )}
      {/*  Edit Dialog */}
      {isEditDialogOpen && (
        <Dialog title="Edit Currency" onClose={() => setIsEditDialogOpen(false)} className="h-[540px]">
          <CurrencyForm
            form={editCurrencyForm}
            onSubmit={onUpdate}
            onCancel={onEditCancel}
            step={editStep}
            onPrev={() => setEditStep(1)}
            onNext={() => setEditStep(2)}
            worldCountries={worldCountries}
            worldCurrencies={worldCurrencies}
            worldCountryCurrencies={worldCountryCurrencies}
          />
        </Dialog>
      )}
    </div>
  );
};

export default CurrencyManagement;

/*  Dialog Reusable Component */
const Dialog = ({ title, onClose, children, className }: any) => {
  const dialog = (
    <div className="fixed inset-0 bg-black/40 dark:bg-white/30 flex items-center justify-center z-[9999]">
      <div className={`bg-white dark:bg-black p-6 rounded-lg w-[450px] shadow-lg ${className || ''}`}>
        <div className="flex justify-between mb-3">
          <h3 className="text-xl font-bold dark:text-white">{title}</h3>
          <button onClick={onClose} className="btn btn-outline btn-danger font-bold text-md">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  return ReactDOM.createPortal(dialog, document.body);
};

/* Form UI */
const CurrencyForm = ({
  form,
  onSubmit,
  onCancel,
  step,
  onPrev,
  onNext,
  worldCountries,
  worldCurrencies,
  worldCountryCurrencies
}: any) => {
  const selectedCountryName = form.watch('Country');
  const selectedCountry = worldCountries.find(
    (c: WorldCountry) => c.CountryName === selectedCountryName
  );
  const countryCurrencyIds = selectedCountry
    ? worldCountryCurrencies
        .filter((cc: WorldCountryCurrency) => cc.CountryID === selectedCountry.CountryID)
        .map((cc: WorldCountryCurrency) => cc.CurrencyID)
    : [];
  const currencyOptions = selectedCountry
    ? worldCurrencies.filter((c: WorldCurrency) => countryCurrencyIds.includes(c.CurrencyID))
    : worldCurrencies;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="flex items-center justify-between">
      <div className="text-sm text-gray-500 dark:text-gray-400">Step {step} of 2</div>
      <div className="flex gap-2">
        <span className={`h-1 w-8 rounded ${step === 1 ? 'bg-primary' : 'bg-gray-300'}`} />
        <span className={`h-1 w-8 rounded ${step === 2 ? 'bg-primary' : 'bg-gray-300'}`} />
      </div>
    </div>

    <div>
      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="font-medium dark:text-white">Country</label>
            <Controller
              name="Country"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value || ''}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const selected = worldCountries.find(
                      (c: WorldCountry) => c.CountryName === value
                    );
                    if (!selected) {
                      form.setValue('CurrencyCode', '');
                      form.setValue('CurrencyName', '');
                      form.setValue('Symbol', '');
                      return;
                    }

                    const primaryLink =
                      worldCountryCurrencies.find(
                        (cc: WorldCountryCurrency) =>
                          cc.CountryID === selected.CountryID && cc.IsPrimary
                      ) ||
                      worldCountryCurrencies.find(
                        (cc: WorldCountryCurrency) => cc.CountryID === selected.CountryID
                      );

                    const primaryCurrency = primaryLink
                      ? worldCurrencies.find(
                          (c: WorldCurrency) => c.CurrencyID === primaryLink.CurrencyID
                        )
                      : undefined;

                    if (primaryCurrency) {
                      form.setValue('CurrencyCode', primaryCurrency.CurrencyCode);
                      form.setValue('CurrencyName', primaryCurrency.CurrencyName);
                      form.setValue('Symbol', primaryCurrency.CurrencySymbol ?? '');
                    } else {
                      form.setValue('CurrencyCode', '');
                      form.setValue('CurrencyName', '');
                      form.setValue('Symbol', '');
                    }
                  }}
                >
                  <SelectTrigger className="input border w-full mt-1">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:text-white dark:bg-black">
                    {worldCountries.map((country: WorldCountry) => (
                      <SelectItem key={country.CountryID} value={country.CountryName}>
                        {country.CountryName}
                        {country.ISO2 ? ` (${country.ISO2})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div>
            <label className="font-medium dark:text-white">Currency Code</label>
            <Controller
              name="CurrencyCode"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value || ''}
                  disabled={!selectedCountry}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const selected = worldCurrencies.find(
                      (c: WorldCurrency) => c.CurrencyCode === value
                    );
                    if (selected) {
                      form.setValue('CurrencyName', selected.CurrencyName);
                      form.setValue('Symbol', selected.CurrencySymbol ?? '');
                    }
                  }}
                >
                  <SelectTrigger className="input border w-full mt-1">
                    <SelectValue
                      placeholder={
                        selectedCountry ? 'Select currency code' : 'Select a country first'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:text-white dark:bg-black">
                    {currencyOptions.map((currency: WorldCurrency) => (
                      <SelectItem key={currency.CurrencyID} value={currency.CurrencyCode}>
                        {currency.CurrencyCode} - {currency.CurrencyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div>
            <label className="font-medium dark:text-white">Currency Name</label>
            <input
              className="input border w-full mt-1"
              placeholder="Enter the Currency Name"
              {...form.register('CurrencyName')}
            />
          </div>

          <div>
            <label className="font-medium dark:text-white">Symbol</label>
            <input
              className="input border w-full mt-1"
              placeholder="Enter the Symbol"
              {...form.register('Symbol')}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <label className="font-medium dark:text-white">Decimal Places</label>
          <input
            type="number"
            className="input border w-full"
            {...form.register('DecimalPlaces', { valueAsNumber: true })}
          />

          <label className="flex gap-2 mt-2 dark:text-white font-semibold">
            <input type="checkbox" {...form.register('IsActive')} /> Active
          </label>
        </div>
      )}
    </div>

    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-outline btn-secondary text-md px-5"
          onClick={onPrev}
          disabled={step === 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-outline btn-primary text-md px-5"
          onClick={onNext}
          disabled={step === 2}
        >
          Next
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-outline btn-secondary text-md px-5"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="btn btn-primary btn-outline text-md px-5" disabled={step !== 2}>
          Save
        </button>
      </div>
    </div>
    </form>
  );
};
