

import { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useRole } from '../FrameworkFiles/RoleContext';
import DataTable from '../FrameworkComponent/DataTable';
import { KeenIcon } from '@/components';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { apiFetch } from '@/utils/apiFetch';

// role schema
export const roleSchema = z.object({
  Assets: z.array(z.string().min(1)).min(1, 'Select at least one asset'),
  Role: z.string().min(1, 'Role is required'),
  Description: z.string().nullable().optional(),
  PermissionsByAsset: z.any().default({})
});

type RoleFormInput = z.input<typeof roleSchema>;
export type RoleFormData = z.output<typeof roleSchema>;

type Asset = {
  AssetID: string;
  AssetName: string;
  AssetDescription: string;
  Created_At?: string;
  AssetType: string;
  AssetKey: string;
  PermissionLevel: string[];
};

interface Role {
  Id: number;
  Assets?: string; // comma-separated list from backend
  Role: string;
  Description: string | null;
  Permissions?: string[] | string; // legacy
  RoleAssets?: { AssetName: string; Permissions: string | string[] }[]; // optional for edit
  CreatedAt?: string;
  UpdatedAt?: string;
}

type TabKey = 'role-access' | 'access-logs';

type AccessLogEntry = {
  Timestamp: string;
  Role: string | null;
  Asset: string;
  Action: string;
  Status: 'Success' | 'Denied';
  IPAddress: string;
  Details: string;
};
type RoleAsset = {
  AssetName: string;
  Permissions: string | string[];
};
type RoleAssetsJoinRow = Record<string, any>;
const RoleManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('role-access');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [allowedPermissions, setAllowedPermissions] = useState<string[]>([]);
  const [showLogPopup, setShowLogPopup] = useState(false);
  const [logPopupContent, setLogPopupContent] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRoleAssetId, setEditingRoleAssetId] = useState<number | null>(null);
  const [isRowAssetEdit, setIsRowAssetEdit] = useState(false);
  const queryClient = useQueryClient();
  const { selectedRole } = useRole();
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState('today');
  const [actionFilter, setActionFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState('all');
  const [rolePage, setRolePage] = useState(1);
  const [roleLimit, setRoleLimit] = useState(10);
  const {
    data: roles = [],
    isLoading: rolesLoading,
    isError: rolesError
  } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiFetch('/api/framework/permissionroles');
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch roles: ${errorText}`);
      }
      return res.json();
    }
  });
  console.log(roles);
  const {
    data: fetchedLogs = [],
    isLoading: logsLoading,
    isError: logsError
  } = useQuery<AccessLogEntry[]>({
    queryKey: ['access-logs'],
    queryFn: async () => {
      const res = await apiFetch('/api/framework/log-access');
      if (!res.ok) throw new Error('Failed to fetch access logs');
      return res.json();
    }
  });

  const uniqueAssets = Array.from(new Set(fetchedLogs.map((log) => log.Asset))).filter(Boolean);

  const pageSize = 10;
  const filteredLogs = fetchedLogs.filter((log) => {
    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      log.Role?.toLowerCase().includes(lowerSearch) ||
      log.Asset?.toLowerCase().includes(lowerSearch) ||
      log.Action?.toLowerCase().includes(lowerSearch) ||
      log.IPAddress?.toLowerCase().includes(lowerSearch);

    const logDate = new Date(log.Timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const logDay = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate());

    let matchesDate = true;
    if (dateFilter === 'today') {
      matchesDate = logDay.getTime() === today.getTime();
    } else if (dateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      matchesDate = logDay.getTime() === yesterday.getTime();
    } else if (dateFilter === 'week') {
      const oneWeekAgo = new Date(today);
      oneWeekAgo.setDate(today.getDate() - 7);
      matchesDate = logDay >= oneWeekAgo && logDay <= today;
    } else if (dateFilter === 'month') {
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setMonth(today.getMonth() - 1);
      matchesDate = logDay >= oneMonthAgo && logDay <= today;
    }
    const matchesAction =
      actionFilter === 'all' || log.Action?.toLowerCase() === actionFilter.toLowerCase();

    const matchesAsset =
      assetFilter === 'all' || log.Asset?.toLowerCase() === assetFilter.toLowerCase();

    return matchesSearch && matchesDate && matchesAction && matchesAsset;
  });
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalAccess = fetchedLogs.length;
  const successfulAccess = fetchedLogs.filter((log) => log.Status === 'Success').length;
  const failedAccess = fetchedLogs.filter((log) => log.Status === 'Denied').length;
  const unauthorizedAccess = fetchedLogs.filter(
    (log) => log.Status === 'Denied' && log.Role === null
  ).length;

  useEffect(() => {
    if (selectedRole && roles.length > 0) {
      const matched = roles.find((r) => r.Role === selectedRole);
      const perms =
        typeof matched?.Permissions === 'string'
          ? (matched.Permissions as string).split(',').map((p: string) => p.trim())
          : Array.isArray(matched?.Permissions)
            ? matched.Permissions
            : [];
      setAllowedPermissions(perms);
    }
  }, [selectedRole, roles]);


  {
    !selectedRole && (
      <div className="text-center text-yellow-600 bg-yellow-50 border border-yellow-200 p-3 rounded">
        Please select a role in the header to activate permissions.
      </div>
    );
  }

  async function logAccess(log: AccessLogEntry) {
    try {
      await apiFetch('/api/framework/log-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
    } catch (err) {
      console.error('Failed to log access:', err);
    }
  }

  // role form
  const roleForm = useForm<RoleFormInput, any, RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      Assets: [],
      Role: '',
      Description: '',
      PermissionsByAsset: {}
    }
  });
  const editRoleForm = useForm<RoleFormInput>({
    defaultValues: {
      Role: '',
      Assets: [],
      Description: '',
      PermissionsByAsset: {}
    }
  });

  const {
    data: assets = [],
    isLoading,
    error
  } = useQuery<Asset[]>({
    queryKey: ['assets'],
    queryFn: async () => {
      const res = await apiFetch('/api/framework/assets');
      if (!res.ok) throw new Error('Failed to fetch assets');
      const json = await res.json();
      return json as Asset[];
    }
  });
  console.log(assets);

  const {
    data: roleAssetsJoin = [],
    isLoading: roleAssetsJoinLoading,
    isError: roleAssetsJoinError
  } = useQuery<RoleAssetsJoinRow[]>({
    queryKey: ['role-assets-join'],
    queryFn: async () => {
      const res = await apiFetch('/api/framework/role-assets-join');
      if (!res.ok) throw new Error('Failed to fetch role assets join');
      return res.json();
    }
  });

  const roleAssetsJoinColumns = useMemo(() => {
    if (!roleAssetsJoin.length) return [];
    const toLabel = (key: string) =>
      key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return Object.keys(roleAssetsJoin[0]).map((key) => ({
      key,
      label: toLabel(key)
    }));
  }, [roleAssetsJoin]);

  const getJoinRoleId = (row: RoleAssetsJoinRow): number | null => {
    const candidates = [
      row.RoleId,
      row.RoleID,
      row.Role_Id,
      row.roleId,
      row.roleID,
      row.role_id,
      row.Id
    ];
    const val = candidates.find((v) => v !== undefined && v !== null);
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const getJoinRowKey = (row: RoleAssetsJoinRow): string | number => {
    const candidates = [
      row.RoleAssetId,
      row.RoleAssetID,
      row.RoleAssetsId,
      row.RoleAssetsID,
      row.Id,
      row.RoleId,
      row.RoleID
    ];
    const val = candidates.find((v) => v !== undefined && v !== null);
    if (val !== undefined && val !== null) return val;
    try {
      return JSON.stringify(row);
    } catch {
      return String(Math.random());
    }
  };

  const getJoinRoleName = (row: RoleAssetsJoinRow): string => {
    return (
      row.RoleName ??
      row.Role ??
      row.role ??
      row.role_name ??
      row.Role_Name ??
      ''
    );
  };

  const getAssetsForJoinRole = (roleId: number): string[] => {
    return roleAssetsJoin
      .filter((r) => getJoinRoleId(r) === roleId)
      .map((r) => (r.AssetName ?? r.assetName ?? '').toString().trim())
      .filter(Boolean);
  };

  const getPermissionsMapForJoinRow = (
    row: RoleAssetsJoinRow
  ): Record<string, string[]> => {
    const assetName = (row.AssetName ?? row.assetName ?? '').toString().trim();
    if (!assetName) return {};
    const permsRaw = row.Permissions ?? row.permissions ?? '';
    return { [assetName]: normalizePermissionLevel(permsRaw) };
  };

  const openEditDialogFromRow = (row: RoleAssetsJoinRow | Role) => {
    const joinRow = row as RoleAssetsJoinRow;
    const roleRow = row as Role;
    const joinAssetName = (joinRow.AssetName ?? joinRow.assetName ?? '').toString().trim();
    const isRowEdit = roleAssetsJoin.length > 0 && (joinAssetName || joinRow.Permissions);
    setIsRowAssetEdit(isRowEdit);

    const roleId =
      getJoinRoleId(joinRow) ??
      roles.find((r) => r.Role === getJoinRoleName(joinRow))?.Id ??
      roleRow.Id ??
      null;

    const roleName = getJoinRoleName(joinRow) || roleRow.Role || '';
    const roleFromList =
      roles.find((r) => (roleId ? r.Id === roleId : r.Role === roleName)) ?? null;

    let assetsList: string[] = [];
    if (!assetsList.length && roleFromList?.Assets) {
      assetsList = roleFromList.Assets.split(',').map((a) => a.trim()).filter(Boolean);
    }
    if (!assetsList.length && typeof roleRow.Assets === 'string') {
      assetsList = roleRow.Assets.split(',').map((a) => a.trim()).filter(Boolean);
    }
    if (isRowEdit && joinAssetName) {
      assetsList = [joinAssetName];
    } else if (!assetsList.length && joinAssetName) {
      assetsList = [joinAssetName];
    }

    const description =
      roleFromList?.Description ??
      roleRow.Description ??
      joinRow.Description ??
      '';

    setEditingRole({
      Id: roleId ?? (roleFromList?.Id ?? 0),
      Role: roleFromList?.Role ?? roleName,
      Description: description,
      Assets: assetsList.join(', ')
    });
    const roleAssetId =
      joinRow.Id ??
      joinRow.RoleAssetId ??
      joinRow.RoleAssetID ??
      joinRow.roleAssetId ??
      null;
    setEditingRoleAssetId(
      roleAssetId !== null && roleAssetId !== undefined ? Number(roleAssetId) : null
    );

    // For row-level edits, force a single selected asset so updates target the correct row.
    setEditSelectedAssets(isRowEdit && joinAssetName ? [joinAssetName] : assetsList);

    editRoleForm.reset({
      Role: roleFromList?.Role ?? roleName,
      Assets: assetsList,
      Description: description,
      PermissionsByAsset: {}
    });

    setIsEditDialogOpen(true);

    if (roleId) {
      // For row-based edit, use the clicked row's asset + permissions only.
      if (isRowEdit) {
        const joinPerms = getPermissionsMapForJoinRow(joinRow);
        editRoleForm.setValue('PermissionsByAsset', joinPerms);
        setEditSelectedAssets(Object.keys(joinPerms));
      } else {
        loadRoleAssets(roleId);
      }
    }
  };

  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [editSelectedAssets, setEditSelectedAssets] = useState<string[]>([]);

  useEffect(() => {
    roleForm.setValue('Assets', selectedAssets, { shouldValidate: true });
  }, [selectedAssets, roleForm]);

  useEffect(() => {
    editRoleForm.setValue('Assets', editSelectedAssets, { shouldValidate: true });
  }, [editSelectedAssets, editRoleForm]);

  // Handle checkbox selection
  const handleAssetChange = (assetName: string) => {
    setSelectedAssets((prevSelectedAssets) => {
      if (prevSelectedAssets.includes(assetName)) {
        // If the asset is already selected, unselect it
        return prevSelectedAssets.filter((asset) => asset !== assetName);
      } else {
        // If the asset is not selected, select it
        return [...prevSelectedAssets, assetName];
      }
    });
  };
  const handleEditAssetChange = (assetName: string) => {
    setEditSelectedAssets((prevSelectedAssets) => {
      if (isRowAssetEdit) {
        // Row-asset edits should update a single asset row.
        return [assetName];
      }
      if (prevSelectedAssets.includes(assetName)) {
        return prevSelectedAssets.filter((asset) => asset !== assetName);
      } else {
        return [...prevSelectedAssets, assetName];
      }
    });
  };

  const normalizePermissionLevel = (val: unknown): string[] => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((v) => String(v).trim()).filter(Boolean);
          }
        } catch {
          // fall through to CSV parsing
        }
      }
    }
    if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(',').map((v) => v.trim()).filter(Boolean);
    return [];
  };
  const filterPermissionsByAsset = (
    assetsList: string[],
    permissionsByAsset: Record<string, string[]>
  ) => {
    const filtered: Record<string, string[]> = {};
    assetsList.forEach((asset) => {
      if (permissionsByAsset?.[asset]?.length) {
        filtered[asset] = permissionsByAsset[asset];
      }
    });
    return filtered;
  };
  const normalizeAssetsList = (assets: unknown): string[] => {
    if (!Array.isArray(assets)) return [];
    return Array.from(
      new Set(
        assets
          .map((a) => String(a ?? '').trim())
          .filter(Boolean)
      )
    );
  };

  const createRoleMutation = useMutation<any, Error, RoleFormData>({
    mutationFn: async (data) => {
      const assetsList = normalizeAssetsList(data.Assets);
      const formattedData = {
        ...data,
        Assets: assetsList,
        PermissionsByAsset: filterPermissionsByAsset(assetsList, data.PermissionsByAsset ?? {})
      };
      const response = await apiFetch('/api/framework/permissionroles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedData)
      });

      const text = await response.text();

      if (!response.ok) {
        try {
          const errorJson = JSON.parse(text);
          throw new Error(errorJson.error || 'Failed to create role');
        } catch {
          throw new Error(text || 'Failed to create role');
        }
      }

      return text ? JSON.parse(text) : null;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-assets-join'] });
      setIsCreateDialogOpen(false);
      roleForm.reset();
      toast.success('Role created successfully!');
    },
    onError: () => toast.error('Failed to create role')
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (data: any) => {
      const assetsList = normalizeAssetsList(data.Assets);
      const formattedData = {
        ...data,
        Assets: assetsList,
        PermissionsByAsset: filterPermissionsByAsset(assetsList, data.PermissionsByAsset ?? {})
      };
      console.log('Formatted Update Payload:', formattedData);
      console.log(data);
      console.log(data.Id);
      const response = await apiFetch(`/api/framework/permissionroles/${data.Id}`, {
        method: 'PUT', // Or 'POST' if you handle update via same SP
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedData)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update role');
      }

      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-assets-join'] }); // Refresh roles list
      setIsEditDialogOpen(false); // Close the dialog
      toast.success('Role updated successfully!');
    },

    onError: (error: any) => {
      toast.error('Failed to update role');
    }
  });
  const updateRoleAssetMutation = useMutation({
    mutationFn: async (data: { id: number; AssetName: string; Permissions: string[] }) => {
      const response = await apiFetch(`/api/framework/role-assets/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AssetName: data.AssetName,
          Permissions: data.Permissions
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update role asset');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-assets-join'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setIsEditDialogOpen(false);
      toast.success('Role asset updated successfully!');
    },
    onError: () => {
      toast.error('Failed to update role asset');
    }
  });
  const deleteRoleAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiFetch(`/api/framework/role-assets/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete role asset');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-assets-join'] });
      toast.success('Role asset deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete role asset');
    }
  });
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      const response = await apiFetch(`/api/framework/permissionroles/${roleId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete role');
      }

      return await response.json();
    },

    onSuccess: (data) => {
      toast.success('Role deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['roles'] }); 
    },

    onError: (error: any) => {
      toast.error('Failed to delete role');
    }
  });

  // filter
  const filteredRoles = roles.filter((role: Role) => {
    const lowerSearch = searchTerm.toLowerCase();
    const permsString = Array.isArray(role.Permissions)
      ? role.Permissions.join(',')
      : (role.Permissions ?? '');

    return (
      role.Role?.toLowerCase().includes(lowerSearch) ||
      role.Description?.toLowerCase().includes(lowerSearch) ||
      permsString.toLowerCase().includes(lowerSearch)
    );
  });

  const filteredRoleAssetsJoin = roleAssetsJoin.filter((row: RoleAssetsJoinRow) => {
    const lowerSearch = searchTerm.toLowerCase().trim();
    if (!lowerSearch) return true;

    const roleName = String(
      row.RoleName ??
      row.Role ??
      row.role ??
      row.role_name ??
      row.Role_Name ??
      ""
    ).toLowerCase();

    const assetName = String(
      row.AssetName ??
      row.assetName ??
      row.asset_name ??
      ""
    ).toLowerCase();

    return roleName.includes(lowerSearch) || assetName.includes(lowerSearch);
  });

  const roleAccessRows = roleAssetsJoin.length ? filteredRoleAssetsJoin : filteredRoles;
  const roleAccessTotal = roleAccessRows.length;
  const roleAccessTotalPages = Math.max(1, Math.ceil(roleAccessTotal / roleLimit));

  useEffect(() => {
    if (rolePage > roleAccessTotalPages) {
      setRolePage(roleAccessTotalPages);
    }
  }, [rolePage, roleAccessTotalPages]);

  useEffect(() => {
    setRolePage(1);
  }, [searchTerm, activeTab, roleAssetsJoin.length]);

  const paginatedRoleAccessRows = roleAccessRows.slice(
    (rolePage - 1) * roleLimit,
    rolePage * roleLimit
  );

  // export
  const exportToExcel = (data: object[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Roles');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, `${filename}.xlsx`);
  };

  const handleASsestLogExport = () => {
    const exportData = filteredLogs.map((log) => ({
      Timestamp: new Date(log.Timestamp).toLocaleString(),
      Role: log.Role,
      Asset: log.Asset,
      Action: log.Action,
      Status: log.Status,
      IPAddress: log.IPAddress,
      Details: log.Details
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Access Logs');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });
    const fileData = new Blob([excelBuffer], {
      type: 'application/octet-stream'
    });
    saveAs(fileData, 'AccessLogs.xlsx');
  };


  const handleEditRoleClick = (role: Role) => {
    console.log('Editing role:', role);
    setEditingRole(role);

    const assetsList =
      typeof role.Assets === 'string'
        ? role.Assets.split(',').map((a) => a.trim()).filter(Boolean)
        : [];
    setEditSelectedAssets(assetsList);

    editRoleForm.reset({
      Role: role.Role,
      Assets: assetsList,
      Description: role.Description ?? '',
      PermissionsByAsset: {}
    });

    setIsEditDialogOpen(true);
  };

  const loadRoleAssets = async (roleId: number) => {
    try {
      const res = await apiFetch(`/api/framework/permissionroles/${roleId}/assets`);
      if (!res.ok) return;
      const roleAssets: RoleAsset[] = await res.json();
      if (!Array.isArray(roleAssets)) return;

      const assetsList = roleAssets
        .map((ra) => ra.AssetName)
        .filter(Boolean);
      if (assetsList.length > 0) {
        setEditSelectedAssets(assetsList);
      }

      const map: Record<string, string[]> = {};
      roleAssets.forEach((ra) => {
        const perms = normalizePermissionLevel(ra.Permissions);
        map[ra.AssetName] = perms;
      });
      editRoleForm.setValue('PermissionsByAsset', map);
    } catch (e) {
      console.error('Failed to load role assets', e);
    }
  };

  useEffect(() => {
    if (editingRole?.Id) {
      loadRoleAssets(editingRole.Id);
    }
  }, [editingRole?.Id]);

  useEffect(() => {
    if (!isEditDialogOpen || !editingRole) return;

    const roleId = editingRole.Id;
    let assetsList: string[] = [];

    if (roleId) {
      assetsList = getAssetsForJoinRole(roleId);
    }

    if (!assetsList.length && editingRole.Assets) {
      assetsList = editingRole.Assets.split(',').map((a) => a.trim()).filter(Boolean);
    }

    setEditSelectedAssets(assetsList);

    editRoleForm.reset({
      Role: editingRole.Role ?? '',
      Assets: assetsList,
      Description: editingRole.Description ?? '',
      PermissionsByAsset: editRoleForm.getValues('PermissionsByAsset') ?? {}
    });
  }, [
    isEditDialogOpen,
    editingRole?.Id,
    editingRole?.Role,
    editingRole?.Description,
    editingRole?.Assets,
    roleAssetsJoin,
    editRoleForm
  ]);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const res = await apiFetch('/api/framework/user-roles');
      if (!res.ok) throw new Error('Failed to fetch user roles');
      const data = await res.json();
      console.log(' Raw user role data from backend:', data);
      return Array.isArray(data) ? data : [];
    }
  });

  const roleColumns = [
    // ROLE ID
    {
      key: 'Id',
      label: 'Role ID'
    },

    // ASSET NAME
    {
      key: 'Assets',
      label: 'Assets',
      render: (r: any) => (
        <div className="max-w-xs overflow-x-auto text-xs flex flex-wrap gap-2">
          {(r.Assets ?? '')
            .toString()
            .split(',')
            .map((a: string) => a.trim())
            .filter(Boolean)
            .map((asset: string, idx: number) => (
              <Badge
                key={idx}
                variant="outline"
                className="badge badge-pill badge-outline badge-primary"
              >
                {asset}
              </Badge>
            ))}
        </div>
      )
    },

    // ROLE NAME
    {
      key: 'Role',
      label: 'Role'
    },

    // DESCRIPTION
    {
      key: 'Description',
      label: 'Description',
      render: (r: any) => r.Description || '-'
    },

    // PERMISSIONS (Badge list, split by comma)
    {
      key: 'Permissions',
      label: 'Permissions',
      render: (r: any) => (
        <div className="max-w-xs overflow-x-auto text-xs flex flex-wrap gap-2">
          {(r.Permissions ?? '')
            .toString()
            .split(',')
            .filter(Boolean)
            .map((perm: string, idx: number) => (
              <Badge
                key={idx}
                variant="outline"
                className="badge badge-pill badge-outline badge-primary"
              >
                {perm.trim()}
              </Badge>
            ))}
        </div>
      )
    }
  ];
  const auditLogColumns = [
    // TIMESTAMP
    {
      key: 'Timestamp',
      label: 'Timestamp',
      render: (log: any) => new Date(log.Timestamp).toLocaleString()
    },

    // ROLE
    {
      key: 'Role',
      label: 'Role',
      render: (log: any) => log.Role ?? '—'
    },

    // ASSET
    {
      key: 'Asset',
      label: 'Asset'
    },

    // ACTION
    {
      key: 'Action',
      label: 'Action'
    },

    // STATUS
    {
      key: 'Status',
      label: 'Status'
    },

    // IP ADDRESS
    {
      key: 'IPAddress',
      label: 'IP Address'
    },

    // DETAILS BUTTON
    {
      key: 'Details',
      label: 'Details',
      render: (log: any) =>
        log.Status === 'Success' ? (
          <button
            className="text-primary"
            onClick={() => {
              setLogPopupContent(log.Details);
              setShowLogPopup(true);
            }}
          >
            <KeenIcon icon="eye" />
          </button>
        ) : (
          <button
            className="text-red-600"
            onClick={() => {
              setLogPopupContent(log.Details);
              setShowLogPopup(true);
            }}
          >
            <AlertTriangle className="h-3 w-3" />
          </button>
        )
    }
  ];


  return (
    <div className="card">
      {/* card 1 */}
      <div className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left: Heading + Subtext */}
          <div>
            <h2 className="text-2xl font-bold">System Assets Management</h2>
            <p className="text-md text-gray-500">
              Manage system assets, role-based access control, and asset access logging
            </p>
          </div>

          {/* Right: Buttons */}
          <div className="flex flex-wrap items-center gap-3 sm:justify-end justify-start">
            <button
              className="btn btn-outline btn-success flex items-center gap-2 text-base"
              onClick={() => exportToExcel(filteredRoles, 'Roles_Export')}
            >
              <i className="ki-solid ki-exit-up"></i>
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* card 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 xl:gap-10 gap-3 w-full p-5 ">
        <div className="card btn-outline bg-[#BF55EC] text-white p-6 flex items-center justify-center ">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <i className="ki-solid ki-shield-search xl:text-5xl text-3xl"></i>
          </div>
          <div className="text-left">
            <h1 className="xl:text-2xl text-lg font-bold dark:text-white">
              {roles.length} Role Permissions
            </h1>
          </div>
        </div>
        <div className="card btn-outline bg-primary text-white p-6 flex items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <i className="ki-solid ki-notepad xl:text-5xl text-3xl"></i>
          </div>
          <div>
            <h1 className="xl:text-2xl text-lg font-bold dark:text-white">
              {fetchedLogs.length} Access Logs
            </h1>
          </div>
        </div>

      </div>
      <div className="p-5">
        <div className="card p-4">
          <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              className={`px-6 py-4 rounded-md ${activeTab === 'role-access'
                  ? 'bg-blue-400 font-bold text-white text-lg'
                  : 'bg-gray-200 text-gray-700 font-bold'
                }`}
              onClick={() => setActiveTab('role-access')}
            >
              Role Access
            </button>
            <button
              className={`px-6 py-4 rounded-md ${activeTab === 'access-logs'
                  ? 'bg-blue-400 font-bold text-white text-lg'
                  : 'bg-gray-200 text-gray-700 font-bold'
                }`}
              onClick={() => setActiveTab('access-logs')}
            >
              Access Logs
            </button>
          </div>
        </div>
      </div>
      <div className="p-4 pt-0">
        <div className="card p-4">
          {/* Tab content */}
          <div className="p-0">

            {activeTab === 'role-access' && (
              <>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-6">
                    {/* LEFT: Heading + Paragraph */}
                    <div>
                      <h3 className="text-xl font-bold dark:text-white">Role-Based Asset Access</h3>
                      <p className="text-md text-gray-500 dark:text-gray-600">
                        Configure role-based permissions for system assets
                      </p>
                    </div>

                    {/* RIGHT: Search + Button */}
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-10">
                      <div className="input input-md w-full sm:w-48 2xl:w-60 border hover:border-blue-400 border-blue-300 text-md flex items-center gap-2">
                        <i className="ki-filled ki-magnifier"></i>
                        <input
                          className="w-full outline-none"
                          placeholder="Search Teams"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>

                      <button
                        className="btn btn-outline btn-primary w-full sm:w-auto"
                        onClick={() => setIsCreateDialogOpen(true)}
                      >
                        <i className="ki-solid ki-plus text-xl"></i>
                        Add Role Permission
                      </button>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex justify-center p-8">
                      <RefreshCw className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid">
                      <div className="card min-w-full">
                        <div className="card-table scrollable-x-auto">
                          <DataTable
                            data={paginatedRoleAccessRows}
                            columns={roleAssetsJoin.length ? roleAssetsJoinColumns : roleColumns}
                            rowKey={(row) =>
                              roleAssetsJoin.length
                                ? getJoinRowKey(row as RoleAssetsJoinRow)
                                : (row as Role).Id
                            }
                            onEdit={(row) => {
                              if (roleAssetsJoin.length) {
                                openEditDialogFromRow(row as RoleAssetsJoinRow);
                                return;
                              }
                              openEditDialogFromRow(row as Role);
                            }}
                            onDelete={(row) => {
                              if (roleAssetsJoin.length) {
                                const joinRow = row as RoleAssetsJoinRow;
                                const roleAssetId =
                                  joinRow.Id ??
                                  joinRow.RoleAssetId ??
                                  joinRow.RoleAssetID ??
                                  joinRow.roleAssetId ??
                                  null;
                                if (roleAssetId !== null && roleAssetId !== undefined) {
                                  deleteRoleAssetMutation.mutate(Number(roleAssetId));
                                }
                                return;
                              }
                              deleteRoleMutation.mutate((row as Role).Id);
                            }}
                            page={rolePage}
                            limit={roleLimit}
                            total={roleAccessTotal}
                            onPageChange={setRolePage}
                            onLimitChange={(nextLimit) => {
                              setRoleLimit(nextLimit);
                              setRolePage(1);
                            }}
                            showPagination
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {activeTab === 'access-logs' && (
              <>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-6">
                    {/* LEFT: Heading + Paragraph */}
                    <div>
                      <h3 className="text-xl font-bold dark:text-white">Asset Access Logs</h3>
                      <p className="text-md text-gray-500 dark:text-gray-600">
                        Monitor and audit access to system assets
                      </p>
                    </div>
                  </div>
                  {/* 🔍 Filters row */}
                  <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center 2xl:justify-between">
                    {/* Left: Search input (full width on small, fixed on md+) */}
                    <div className="input input-md w-full md:w-60 lg:w-40 2xl:w-72 border hover:border-blue-400 border-blue-300 text-md">
                      <i className="ki-filled ki-magnifier"></i>
                      <input
                        placeholder="Search Teams"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                      />
                    </div>

                    {/* Right: selects + export (stacked on small, inline on md+) */}
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                      <Select
                        value={dateFilter}
                        onValueChange={(val) => {
                          setDateFilter(val);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="w-full md:w-48 lg:w-40 2xl:w-60 btn-outline btn-primary border hover:border-blue-400"
                          size="md"
                        >
                          <SelectValue placeholder="Select Date Range" />
                        </SelectTrigger>
                        <SelectContent className="w-full md:w-48 2xl:w-60 bg-white">
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="yesterday">Yesterday</SelectItem>
                          <SelectItem value="week">Last 7 days</SelectItem>
                          <SelectItem value="month">Last 30 days</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={assetFilter}
                        onValueChange={(val) => {
                          setAssetFilter(val);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="w-full md:w-48 lg:w-40 2xl:w-60 btn-outline btn-primary border hover:border-blue-400"
                          size="md"
                        >
                          <SelectValue placeholder="Select Asset" />
                        </SelectTrigger>
                        <SelectContent className="w-full md:w-48 2xl:w-60 bg-white">
                          <SelectItem value="all">All Assets</SelectItem>
                          {uniqueAssets.map((asset, index) => (
                            <SelectItem key={index} value={asset}>
                              {asset}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <button
                        className="btn btn-outline btn-primary w-full md:w-auto"
                        onClick={handleASsestLogExport}
                      >
                        <i className="ki-solid ki-exit-up text-xl"></i>
                        Export
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 lg:gap-7.5 mt-8">
                    <div className="card p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center justify-center size-[50px] rounded-lg bg-gray-50">
                          <i className="ki-solid ki-arrow-up-refraction text-primary text-3xl font-semibold"></i>
                        </div>
                      </div>

                      <h1 className="text-2xl font-bold dark:text-white mt-2">
                        {totalAccess} Total Access
                      </h1>
                    </div>
                    <div className="card p-3">
                      <div className="flex items-center justify-between ">
                        <div className="flex items-center justify-center size-[50px] rounded-lg bg-gray-100">
                          <i className="ki-solid ki-check-circle text-3xl text-success"></i>
                        </div>
                      </div>
                      <h1 className="text-2xl font-bold dark:text-white mt-2">
                        {successfulAccess} Successful
                      </h1>
                    </div>
                    <div className="card p-3">
                      <div className="flex items-center justify-between ">
                        <div className="flex items-center justify-center size-[50px] rounded-lg bg-gray-100">
                          <i className="ki-solid text-danger ki-cross-circle text-3xl"></i>
                        </div>
                      </div>
                      <h1 className="text-2xl font-bold dark:text-white mt-2">
                        {failedAccess} Failed
                      </h1>
                    </div>
                    <div className="card p-3">
                      <div className="flex items-center justify-between  ">
                        <div className="flex items-center justify-center size-[50px] rounded-lg bg-gray-100">
                          <i className="ki-solid ki-shield-cross text-3xl text-warning"></i>
                        </div>
                      </div>
                      <h1 className="mt-2 text-2xl font-bold dark:text-white">
                        {unauthorizedAccess} Unauthorizedd
                      </h1>
                    </div>
                  </div>

                  <div className="border rounded-lg">
                    <div className="space-y-4 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Recent Access Activity</h3>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="text-sm text-gray-500">Live Updates</span>
                        </div>
                      </div>
                    </div>
                    {logsLoading ? (
                      <p>Loading logs</p>
                    ) : logsError ? (
                      <p className="text-danger"> Error Loading Logs</p>
                    ) : (
                      <div className="grid">
                        <div className="card min-w-full">
                          <div className="card-table scrollable-x-auto">
                            <DataTable
                              data={paginatedLogs}
                              columns={auditLogColumns}
                              rowKey={(index: any) => index} // logs have no ID so use index
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-md form-hint">
                      Showing {(currentPage - 1) * pageSize + 1}-
                      {Math.min(currentPage * pageSize, filteredLogs.length)} of{' '}
                      {filteredLogs.length} access logs
                    </p>
                    <div className="flex gap-5">
                      <button
                        className="btn btn-outline btn-secondary"
                        onClick={() => setCurrentPage((prev) => prev - 1)}
                        disabled={currentPage === 1}
                      >
                        previous
                      </button>
                      <button
                        className="btn btn-outline btn-secondary"
                        onClick={() => setCurrentPage((prev) => prev + 1)}
                        disabled={currentPage * pageSize >= filteredLogs.length}
                      >
                        next
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 p-6 pt-60 md:pt-0 flex items-start md:items-center justify-center">
          <div className="fixed inset-0  dark:bg-white/30 bg-black/60" onClick={() => setIsCreateDialogOpen(false)} />
          <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-2xl z-10 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold dark:text-white">Add New Role</h3>
                <p className="text-md text-gray-500 dark:text-gray-700">
                  Create a new role entry with associated assets and permissions.
                </p>
              </div>
              <button className="btn btn-outline btn-danger font-bold" onClick={() => setIsCreateDialogOpen(false)}>
                <i className="ki-filled ki-cross text-2xl"></i>
              </button>
            </div>

            {/* Role form */}
            {activeTab === 'role-access' && (
              <form
                {...roleForm}
                onSubmit={roleForm.handleSubmit(
                  (data) => {
                    const missingPerms = (data.Assets || []).filter(
                      (a) => !(data.PermissionsByAsset?.[a]?.length)
                    );
                    if (missingPerms.length > 0) {
                      toast.error('Select permissions for all selected assets');
                      return;
                    }
                    console.log('Role Payload:', data);
                    createRoleMutation.mutate(data); 
                  },
                  (errors) => {
                    console.error('Role form validation errors:', errors);
                    toast.error('Please fill all required fields');
                  }
                )}
                className="space-y-4 dark:text-white"
              >
                <div className="flex flex-col gap-4">
                  {/* Role Name */}
                  <label className="flex flex-col">
                    <span className="text-md font-semibold">Role Name *</span>
                    <Controller
                      name="Role"
                      control={roleForm.control}
                      render={({ field }) => (
                        <input
                          type="text"
                          className="input mt-1"
                          placeholder="Enter role name (e.g., Trade Analyst)"
                          {...field}
                        />
                      )}
                    />
                  </label>

                  {/* Checkbox for Asset Selection */}
                  <div className="flex flex-col">
                    <span className="text-md font-semibold mb-1">Select Assets *</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto border rounded p-2">
                      {assets.map((asset) => (
                        <label key={asset.AssetID} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            value={asset.AssetName}
                            checked={selectedAssets.includes(asset.AssetName)}
                            onChange={() => handleAssetChange(asset.AssetName)} // Update selected assets
                          />
                          {asset.AssetName}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Display Selected Assets */}
                  {selectedAssets.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-md font-semibold">Selected Assets:</h3>
                      <ul className="list-disc pl-5">
                        {selectedAssets.map((asset, idx) => (
                          <li key={idx} className="text-sm">
                            {asset}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Description */}
                  <label className="flex flex-col">
                    <span className="text-md font-semibold">Description</span>
                    <Controller
                      name="Description"
                      control={roleForm.control}
                      render={({ field }) => (
                        <textarea
                          placeholder="Enter description..."
                          {...field}
                          value={field.value ?? ''}
                          className="textarea"
                          rows={3}
                        />
                      )}
                    />
                  </label>

                  {/* Permissions per Selected Asset */}
                  {selectedAssets.length > 0 && (
                    <div className="space-y-4">
                      <span className="text-md font-semibold">Permissions per Asset</span>
                      {selectedAssets.map((assetName) => {
                        const asset = assets.find((a) => a.AssetName === assetName);
                        const perms = normalizePermissionLevel(asset?.PermissionLevel);
                        return (
                          <div key={assetName} className="border rounded p-3">
                            <h3 className="font-semibold text-sm mb-2">{assetName}</h3>
                            <Controller
                              name={`PermissionsByAsset.${assetName}` as const}
                              control={roleForm.control}
                              render={({ field }) => (
                                <div className="flex flex-wrap gap-3">
                                  {perms.map((perm: string) => {
                                    const trimmed = perm.trim();
                                    return (
                                      <label key={trimmed} className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          value={trimmed}
                                          checked={Array.isArray(field.value) && field.value.includes(trimmed)}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            let newValue = Array.isArray(field.value) ? [...field.value] : [];

                                            if (checked) newValue.push(trimmed);
                                            else newValue = newValue.filter((v) => v !== trimmed);

                                            field.onChange(newValue);
                                          }}
                                        />
                                        {trimmed.replaceAll('_', ' ')}
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-secondary px-4 py-2 text-md"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createRoleMutation.isPending}
                    className="btn btn-outline btn-primary px-4 py-2 text-md"
                  >
                    {createRoleMutation.isPending ? 'Saving...' : 'Save Role'}
                  </button>
                </div>
              </form>



            )}

          </div>
        </div>
      )}

      {isEditDialogOpen && (
        <div className="fixed inset-0 z-50 p-6 pt-60 md:pt-0 flex items-start  md:items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 dark:bg-white/30 "
            onClick={() => setIsEditDialogOpen(false)}
          />
          <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-2xl z-10 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold dark:text-white">
                  Edit Asset {activeTab.slice(0, -1)}
                </h3>
                <p className="text-md text-gray-500 dark:text-gray-700">
                  Update the {activeTab.slice(0, -1)} entry in Azure SQL Server
                </p>
              </div>
              <button
                className="btn btn-outline btn-danger font-bold"
                onClick={() => setIsEditDialogOpen(false)}
              >
                <i className="ki-filled ki-cross text-2xl"></i>
              </button>
            </div>

            {activeTab === 'role-access' && (
              <form
                {...editRoleForm}
                onSubmit={editRoleForm.handleSubmit(
                  (data) => {
                    const missingPerms = (data.Assets || []).filter(
                      (a) => !(data.PermissionsByAsset?.[a]?.length)
                    );
                    if (missingPerms.length > 0) {
                      toast.error('Select permissions for all selected assets');
                      return;
                    }
                    console.log('Edit Role Payload:', data);
                    if (editingRoleAssetId) {
                      const assetName =
                        (Array.isArray(data.Assets) && data.Assets[0]) ||
                        editSelectedAssets[0];
                      const perms = data.PermissionsByAsset?.[assetName] ?? [];
                      updateRoleAssetMutation.mutate({
                        id: editingRoleAssetId,
                        AssetName: assetName,
                        Permissions: perms
                      });
                      return;
                    }
                    updateRoleMutation.mutate({
                      ...data,
                      Assets: editSelectedAssets,
                      Id: editingRole?.Id
                    });
                  },
                  (errors) => {
                    console.error('Edit role validation errors:', errors);
                    toast.error('Please fill all required fields');
                  }
                )}
                className="space-y-4 dark:text-white"
              >
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col">
                    <span className="text-md font-semibold">Role Name *</span>

                    <Controller
                      name="Role"
                      control={editRoleForm.control}
                      render={({ field }) => (
                        <input
                          type="text"
                          className="input mt-1"
                          placeholder="Enter role name (e.g., Trade Analyst)"
                          {...field}
                          value={field.value ?? ''} // prevents uncontrolled error
                        />
                      )}
                    />
                  </label>

                  <div className="flex flex-col">
                    <span className="text-md font-semibold mb-1">Assets *</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto border rounded p-2">
                      {assets.map((asset) => (
                        <label key={asset.AssetID} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            value={asset.AssetName}
                            checked={editSelectedAssets.includes(asset.AssetName)}
                            onChange={() => handleEditAssetChange(asset.AssetName)}
                          />
                          {asset.AssetName}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex flex-col">
                    <span className="text-md font-semibold">Description</span>

                    <Controller
                      name="Description"
                      control={editRoleForm.control}
                      render={({ field }) => (
                        <textarea
                          placeholder="Enter description..."
                          {...field}
                          value={field.value ?? ''}
                          className="textarea "
                          rows={3}
                        />
                      )}
                    />
                  </label>

                  {editSelectedAssets.length > 0 && (
                    <div className="space-y-4">
                      <span className="text-md font-semibold">Permissions per Asset</span>
                      {editSelectedAssets.map((assetName) => {
                        const asset = assets.find((a) => a.AssetName === assetName);
                        const perms = normalizePermissionLevel(asset?.PermissionLevel);
                        return (
                          <div key={assetName} className="border rounded p-3">
                            <h3 className="font-semibold text-sm mb-2">{assetName}</h3>
                            <Controller
                              name={`PermissionsByAsset.${assetName}` as const}
                              control={editRoleForm.control}
                              render={({ field }) => (
                                <div className="flex flex-wrap gap-3">
                                  {perms.map((perm: any) => {
                                    const trimmed = String(perm).trim();
                                    return (
                                      <label key={trimmed} className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          value={trimmed}
                                          checked={
                                            Array.isArray(field.value) &&
                                            field.value.includes(trimmed)
                                          }
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            let newValue = Array.isArray(field.value)
                                              ? [...field.value]
                                              : [];

                                            if (checked) newValue.push(trimmed);
                                            else newValue = newValue.filter((v) => v !== trimmed);

                                            field.onChange(newValue);
                                          }}
                                        />
                                        {trimmed.replaceAll('_', ' ')}
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-secondary px-4 py-2 text-md"
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={updateRoleMutation.isPending}
                    className="btn btn-outline btn-primary px-4 py-2 text-md"
                  >
                    {updateRoleMutation.isPending ? 'Updating...' : 'Update Role'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {showAccessDenied && (
        <div className="fixed inset-0 z-50 p-6 pt-60 md:pt-0 flex items-center md:items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowAccessDenied(false)} />
          <div className="bg-white rounded shadow-2xl w-full md:w-3/4 xl:w-2/4 2xl:w-1/4 z-10 p-5">
            <div className="text-center mb-4">
              <div>
                <h3 className="text-xl font-bold ">Access Denied</h3>
                <p className="text-md text-gray-500">
                  You do not have permission to perform this action.
                </p>
              </div>
              <div className="mt-5">
                <button
                  className="btn btn-secondary px-4 py-2 text-md"
                  onClick={() => setShowAccessDenied(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showLogPopup && (
        <div className="fixed inset-0 z-50 p-6 pt-60 md:pt-0 flex items-start  md:items-center justify-center">
          <div
            className="fixed inset-0  dark:bg-white/30 bg-black/60"
            onClick={() => setShowLogPopup(false)}
          />
          <div className="bg-white dark:bg-black rounded shadow-2xl w-full lg:w-2/4 xl:w-1/4 z-10 p-5">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold dark:text-white">Access Log Details</h3>
                <p className="text-md text-gray-500 dark:text-gray-700">{logPopupContent}</p>
              </div>
              <button
                className="btn btn-secondary px-4 py-2 text-md"
                onClick={() => setShowLogPopup(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
