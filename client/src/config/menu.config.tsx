import { type TMenuConfig } from '@/components/menu';

const normalizeAssetKey = (item: any): string | undefined =>
  item.asset_key || item.permission?.asset;


const normalizeActions = (permission: any): string[] => {
  if (!permission) return ['view'];
  if (Array.isArray(permission)) {
    const actions = permission.flatMap((p) =>
      Array.isArray(p?.actions) ? p.actions : p?.action ? [p.action] : []
    );
    return actions.length ? actions : ['view'];
  }
  if (Array.isArray(permission.actions)) return permission.actions;
  if (permission.action) return [permission.action];
  return ['view'];
};

const addAssetKeyPermissions = (menu: TMenuConfig): TMenuConfig =>
  menu.map((item) => {
    const children = item.children ? addAssetKeyPermissions(item.children) : item.children;
    const assetKey = normalizeAssetKey(item);
    const actions = normalizeActions(item.permission);

    const permission = assetKey ? { asset: assetKey, actions } : item.permission;

    return {
      ...item,
      asset_key: assetKey,
      ...(children ? { children } : {}),
      ...(permission ? { permission } : {})
    };
  });
export const MENU_SIDEBAR: TMenuConfig = [
  {
    id: 'framework',
    title: 'Management Control',
    icon: 'element-11',
    permission: { asset: 'Management Control', actions: ['view'] },
    children: [
      {
        id: 'framework-dashboard',
        title: 'Framework Dashboard',
        path: '/FrameworkDashboard',
        permission: { asset: 'Management Control', actions: ['view'] }
      },
      {
        id: 'geo',
        title: 'Geographic Management',
        path: '/framework/geographic',
        permission: { asset: 'Management Control', actions: ['view'] }
      },
      {
        id: 'localization',
        title: 'Localization',
        path: '/framework/Localization',
        permission: { asset: 'Management Control', actions: ['view'] }
      },
      {
        id: 'org',
        title: 'Organizational Management',
        path: '/framework/organizational',
        permission: { asset: 'Management Control', actions: ['view'] }
      },
      {
        id: 'currency',
        title: 'Currency Management',
        path: '/framework/CurrencyManagement',
        permission: { asset: 'Management Control', actions: ['view'] }
      },
      {
        id: 'system-assets',
        title: 'System Assets',
        path: '/framework/SystemAssets',
        permission: { asset: 'Management Control', actions: ['view'] }
      },
    ]
  },
  {
    id: 'admin',
    title: 'Admin Management',
    permission: { asset: 'Administration', actions: ['view'] },
    icon: 'profile-circle',
    children: [
      {
        id: 'user-mgmt',
        title: 'User Management',
        path: '/admin/user',
        permission: { asset: 'User Management', actions: ['view'] }
      },
      {
        id: 'role-mgmt',
        title: 'Role Management',
        path: '/admin/RoleManagement',
        permission: { asset: 'Role Management', actions: ['view'] }
      },
      {
        id: 'billing',
        title: 'Billing',
        path: '/Billing',
        permission: { asset: 'Billing', actions: ['view'] }
      },
      {
        id: 'Prompt_management',
        title: 'Prompt Management',
        path: '/framework/prompt-management',
        permission: { asset: 'Prompt Management', actions: ['view', 'create', 'edit'] }
        
      }
    ]
  },
  {
    id: 'Document_management_system',
    title: 'Document Management System',
    asset_key: 'Document Management System',
    path: '/tf_genie/discrepancy/dms', 
    icon: 'profile-circle',
    children: [
      {
        id: 'ocr_factory',
        title: 'OCR Factory',
        permission: { asset: 'OCR Factory', actions: ['view', 'edit', 'approve', 'reject'] },
        icon: 'briefcase',
        children: [
          {
            title: 'Dashboard',
            path: '/tf_genie/discrepancy/dashboard',
            permission: { asset: 'OCR Dashboard', actions: ['view'] }
          },
          {
            title: 'Create Folders',
            path: '/tf_genie/discrepancy/create-session',
            permission: { asset: 'Create Sessions', actions: ['create', 'approve', 'reject'] }
          },
          {
            title: 'Folders',
            path: '/tf_genie/discrepancy/ocr-factory',
            permission: { asset: 'Sessions', actions: ['create', 'approve', 'reject'] }
          }
        ]
      },
      {
        title: 'Image BOX',
        path: '/magic-box',
        permission: { asset: 'Magic BOX', actions: ['view'] }
      },
      {
        title: 'Paddle OCR',
        path: '/paddleocr',
        permission: { asset: 'Paddle OCR', actions: ['view', 'edit', 'approve', 'reject'] }
      },

    ]
  },
  // {
  //   id: 'Prompt_management',
  //   title: 'Prompt Management',
  //   asset_key: 'Prompt Management',
  //   icon: 'profile-circle',
  //   children: [
  //     {
  //       title: 'Prompt Management',
  //       path: '/framework/prompt-management',
  //       permission: { asset: 'Prompt Management', actions: ['view', 'create', 'edit'] }
  //     },
  //   ]
  // },
  {
    id: 'MOC_Mapping',
    title: 'MOC Mapping',
    asset_key: 'MOC_Mapping',
    icon: 'profile-circle',
     path: '/MOC_Mapping',
        permission: { asset: 'MOC Mapping', actions: ['view', 'edit', 'approve', 'reject'] }
    // children: [
    //   {
    //     title: 'MOC Mapping',
    //     path: '/MOC_Mapping',
    //     permission: { asset: 'MOC Mapping', actions: ['view', 'edit', 'approve', 'reject'] }
    //   }
    // ]
  },
  {
    id: 'Pre Issuance',
    title: 'Pre Issuance',
    asset_key: 'Pre Issuance',
    icon: 'profile-circle',
    children: [
      {
        title: '46A',
        path: '/form/46A',
        permission: { asset: '46A', actions: ['view'] }
      },

      {
        title: 'Sanction ',
        path: '/sanction',
        permission: { asset: 'Sanction', actions: ['view'] }
      },
      {
        title: 'Do Not Deal',
        path: '/GoodsMatcher',
        permission: { asset: 'Do Not Deal', actions: ['view'] }
      },
      {
        title: 'Vessel Tracking',
        path: '/vessel-tracking-app',
        permission: { asset: 'Vessel Tracking', actions: ['view'] }
      },
    ]
  },
  {
    id: 'TBML',
    title: 'TBML Management',
    asset_key: 'TBML_Management',
    icon: 'shield-cross',
    children: [
      // {
      //   title: 'Trade Based Money Laundering',
      //   path: '/TBML_Detector',
      //   permission: { asset: 'TBML', actions: ['view'] }
      // },

      {
        title: 'Preshipment Analysis',
        path: '/TBML',
        permission: { asset: 'TBML Preshipment Analysis', actions: ['view'] }

      }]

  },

  // {
  //   id: 'AI_Playbook',
  //   title: 'AI Playbook',
  //   asset_key: 'AI_Playbook',
  //   icon: 'bill',
  //   children: [
  //     {
  //       title: 'AI Playbook',
  //       path: '/AIPlaybook',
  //       permission: 'AccessLogs'
  //     },
  //   ]
  // },

  {
    id: 'Discrepancy Learning',
    title: 'Discrepancy Learning',
    asset_key: 'Discrepancy_Learning',
    icon: 'bill',
    children: [
      {
        title: 'Discrepancy Learning',
        path: '/discrepancy_learning_system',
        permission: { asset: 'Discrepancy Learning', actions: ['view'] }
      },
    ]
  },

  {
    id: 'letter_of_credit',
    title: 'Letter of Credit',
    asset_key:'LC',
    icon: 'questionnaire-tablet',
    children: [
      {
        id: 'ilc-cross-doc',
        title: 'Import Letter of Credit',
        instrument: 'ILC',
        permission: { asset: 'Letter of Credit', actions: ['load', 'edit', 'approve', 'reject'] },

        children: [
          {
            id: 'ilc-cross-doc',
            title: 'Cross Document Check',
            path: '/cross_doc_check/ILC',
            instrument: 'ILC',
            permission: [
              // { asset: 'ILC_Cross Document Check', actions: ['load'] },
              { asset: 'ILC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] }
            ]
          },
          {
            id: 'ilc-amendment',
            title: 'Amendment Verification',
            path: '/AmendmentVerification/ILC',
            instrument: 'ILC',
            permission: [
              // { asset: 'Amendment Verification', actions: ['load'] },
              { asset: 'ILC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] }
            ]
          },
          {
            id: 'ilc-discrepancy',
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/ILC',
            instrument: 'ILC',
            permission: {
              asset: 'ILC Discrepancy Management',
              actions: ['load', 'edit', 'approve', 'reject']
            }
          },
          {
            id: 'ilc-discrepancy-table',
            title: 'Discrepancy Table',
            path: '/discrepancytable/ILC',
            instrument: 'ILC',
            permission: {
              asset: 'ILC Discrepancy Management',
              actions: ['view']
            }
          }
        ]
      },
      {
        id: 'ELC',
        title: 'Export Letter of Credit',
        icon: 'element-11',
        instrument: 'ELC',
        permission: [
          // { asset: 'ELC_Loader', actions: ['load'] },
          { asset: 'ELC', actions: ['load', 'edit', 'approve', 'reject'] }
        ],
        children: [
          {
            id: 'elc-cross-doc',
            title: 'Cross Document Check',
            path: '/cross_doc_check/ELC',
            instrument: 'ELC',
            permission: [
              // { asset: 'ELC_Loader', actions: ['load'] },
              { asset: 'ELC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] }
            ]
          },
          {
            id: 'elc-amendment',
            title: 'Amendment Verification',
            path: '/AmendmentVerification/ELC',
            instrument: 'ELC',
            permission: [
              // { asset: 'ELC_Loader', actions: ['load'] },
              { asset: 'ELC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] }
            ]
          },
          {
            id: 'elc-discrepancy',
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/ELC',
            instrument: 'ELC',
            permission: {
              asset: 'ELC Discrepancy Management',
              actions: ['load', 'edit', 'approve', 'reject']
            }
          },
          {
            id: 'elc-discrepancy-table',
            title: 'Discrepancy Table',
            path: '/discrepancytable/ELC',
            instrument: 'ELC',
            permission: {
              asset: 'ELC Discrepancy Management',
              actions: ['view']
            }
          }
        ]
      },
    ]
  },

  {
    id: 'letter_of_Credit_specialize',
    title: 'Special Letter of Credit',
    asset_key: 'Letter_of_Credit_Specialize',
    icon: 'questionnaire-tablet',
    children: [
      {
        id: 'TLC',
        title: 'Transferable Letter of Credit',
        icon: 'element-11',
        permission: { asset: 'TLC', actions: ['load', 'edit', 'approve', 'reject'] },
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/TLC',
            permission: { asset: 'TLC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: "TLC"
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/TLC',
            permission: { asset: 'TLC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'TLC'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/TLC',
            permission: { asset: 'TLC Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'TLC'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/TLC',
            permission: { asset: 'TLC Discrepancy Management', actions: ['view'] },
            instrument: 'TLC'
          }
        ]
      },
      {
        id: 'BBLC',
        title: 'Back to Back Letter of Credit',
        icon: 'element-11',
        asset_key: 'BBLC',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/BBLC',
            permission: { asset: 'BBLC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'BBLC'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/BBLC',
            permission: { asset: 'BBLC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'BBLC'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/BBLC',
            permission: { asset: 'BBLC Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'BBLC'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/BBLC',
            permission: { asset: 'BBLC Discrepancy Management', actions: ['view'] },
            instrument: 'BBLC'
          }
        ]
      },
      {
        id: 'RLC',
        title: 'Revocable Letter of Credit',
        icon: 'element-11',
        asset_key: 'RLC',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/RLC',
            permission: { asset: 'RLC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'RLC'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/RLC',
            permission: { asset: 'RLC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'RLC'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/RLC',
            permission: { asset: 'RLC Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'RLC'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/RLC',
            permission: { asset: 'RLC Discrepancy Management', actions: ['view'] },
            instrument: 'RLC'
          }
        ]
      },
      {
        id: 'SBLC',
        title: 'Standby Letter of Credit',
        icon: 'element-11',
        asset_key: 'SBLC',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/SBLC',
            permission: { asset: 'SBLC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'SBLC'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/SBLC',
            permission: { asset: 'SBLC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: "SBLC"
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/SBLC',
            permission: { asset: 'SBLC Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'SBLC'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/SBLC',
            permission: { asset: 'SBLC Discrepancy Management', actions: ['view'] },
            instrument: 'SBLC'
          }
        ]
      }
    ]
  },

  {
    id: 'Bill_of_collections',
    title: 'Bill of Collections',
    asset_key: 'BOC',
    icon: 'questionnaire-tablet',
    children: [
      {
        id: 'Import_bill_of_collection',
        title: 'Import Bill of Collection',
        icon: 'element-11',
        asset_key: 'IBC',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/IBC',
            permission: { asset: 'IBC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'IBC'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/IBC',
            permission: { asset: 'IBC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'IBC'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/IBC',
            permission: { asset: 'IBC Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'IBC'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/IBC',
            permission: { asset: 'IBC Discrepancy Management', actions: ['view'] },
            instrument: 'IBC'
          }
        ]
      },
      {
        id: 'Export_bill_of_collection',
        title: 'Export Bill of Collection',
        icon: 'element-11',
        asset_key: 'EBC',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/EBC',
            permission: { asset: 'EBC Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'EBC'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/EBC',
            permission: { asset: 'EBC Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'EBC'

          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/EBC',
            permission: { asset: 'EBC Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'EBC'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/EBC',
            permission: { asset: 'EBC Discrepancy Management', actions: ['view'] },
            instrument: 'EBC'
          }
        ]
      }
    ]
  },

  {
    id: 'Guarantee',
    title: 'Guarantee',
    asset_key: 'Guarantee',
    icon: 'questionnaire-tablet',
    children: [
      {
        id: 'Advance_payment_guarantee',
        title: 'Advance Payment Guarantee',
        icon: 'element-11',
        asset_key: 'APG',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/APG',
            permission: { asset: 'APG Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'APG'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/APG',
            permission: { asset: 'APG Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'APG'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/APG',
            permission: { asset: 'APG Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'APG'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/APG',
            permission: { asset: 'APG Discrepancy Management', actions: ['view'] },
            instrument: 'APG'
          }
        ]
      },
      {
        id: 'performance_guarantee',
        title: 'Performance Guarantee',
        icon: 'element-11',
        asset_key: 'PG',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/PG',
            permission: { asset: 'PG Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'AG'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/PG',
            permission: { asset: 'PG Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'PG'

          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/PG',
            permission: { asset: 'PG Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'PG'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/PG',
            permission: { asset: 'PG Discrepancy Management', actions: ['view'] },
            instrument: 'PG'
          }
        ]
      },
      {
        id: 'Bank_guarantee',
        title: 'Bank Guarantee',
        icon: 'element-11',
        asset_key: 'BG',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/BG',
            permission: { asset: 'BG Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'BG'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/BG',
            permission: { asset: 'BG Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'BG'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/BG',
            permission: { asset: 'BG Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'BG'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/BG',
            permission: { asset: 'BG Discrepancy Management', actions: ['view'] },
            instrument: 'BG'
          }
        ]
      },
      {
        id: 'Retention_guarantee',
        title: 'Retention Guarantee',
        icon: 'element-11',
        asset_key: 'RG',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/RG',
            permission: { asset: 'RG Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'RG'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/RG',
            permission: { asset: 'RG Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: "RG"
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/RG',
            permission: { asset: 'RG Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'RG'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/RG',
            permission: { asset: 'RG Discrepancy Management', actions: ['view'] },
            instrument: 'RG'
          }
        ]
      },
      {
        id: 'Shipping Guarantee',
        title: 'Shipping Guarantee',
        icon: 'element-11',
        asset_key: 'SG',
        children: [
          {
            title: 'Cross Document Check',
            path: '/cross_doc_check/SG',
            permission: { asset: 'SG Cross Document Check', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'SG'
          },
          {
            title: 'Amendment Verification',
            path: '/AmendmentVerification/SG',
            permission: { asset: 'SG Amendment Verification', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'SG'
          },
          {
            title: 'Discrepancy Management',
            path: '/discrepancymanagement/SG',
            permission: { asset: 'SG Discrepancy Management', actions: ['load', 'edit', 'approve', 'reject'] },
            instrument: 'SG'
          },
          {
            title: 'Discrepancy Table',
            path: '/discrepancytable/SG',
            permission: { asset: 'SG Discrepancy Management', actions: ['view'] },
            instrument: 'SG'
          }
        ]
      }
    ]
  },
  {
    id: 'MTManagement',
    title: 'MT Management',
    asset_key: 'MTConverter',
    icon: 'abstract-44',
    children: [
        {
        title: 'MT Generator',
        path: '/MTConverter',
        permission: {
          asset: 'MT Generator',
          actions: ['load', 'generate']
        }
      },
      {
        title: 'MT Validator',
        path: '/MTValidator',
        permission: {
          asset: 'MT Validator',
          actions: ['load', 'validate']
        }
      }
    ]
  },
  {
    id: 'Cure_Management',
    title: 'Cure Management',
    asset_key: 'MTConverter',
    icon: 'abstract-44',
    children: [
      {
        title: 'Cure Management',
        path: '/cure',
        permission: { asset: 'Cure', actions: ['load', 'view','approve',
          'reject','edit'
        ] }
      },
      {
        title: 'Cure Table',
        path: '/curetable',
        permission: { asset: 'CureTable', actions: ['load', 'view'] }
      },
    ]
  },
  
  // {
  //   id: 'Agent ',
  //   title: 'Agent',
  //   asset_key: 'MTConverter',
  //   icon: 'abstract-44',
  //   children: [
  //     {
  //       title: 'MTConverter',
  //       path: '/Agant',
  //       permission: 'AccessLogs'
  //     },
  //   ]
  // },
  // {
  //   id: 'PowerBI',
  //   title: 'PowerBI',
  //   asset_key: 'MTConverter',
  //   icon: 'abstract-44',
  //     path: '/powerbi',
  // },
  // {
  //   id: 'Customer Portal',
  //   title: 'Customer Portal *',
  //   asset_key: 'customer_portal',
  //   icon: 'bill',
  //   children: [
  //     {
  //       title: 'Customer Portal',
  //       path: '/customer_portal',
  //       permission: 'AccessLogs'
  //     },
  //   ]
  // },
  {
    id: 'Trade_Finance_Standards',
    title: 'Trade Finance Standards',
    asset_key: 'Trade_Finance_Standards',
    icon: 'bill',
    children: [
      {
        title: 'Trade Finance Standards',
        path: '/trade-finance-standards',
        permission: { asset: 'Trade Finance Standards', actions: ['load', 'view'] }
      },
      {
        title: 'Standards Ingestion',
        path: '/standards-ingestion',
        permission: { asset: 'Standards Ingestion', actions: ['load', 'view'] }
      },
      {
        title: 'Standards Ingestion CRUD',
        path: '/standards-ingestion/crud',
        permission: { asset: 'Standards Ingestion CRUD', actions: ['load', 'view'] }
      },
    ]
  },
  // {
  //   id: 'Forfaiting Solution',
  //   title: 'Forfaiting Solution',
  //   asset_key: 'Forfaiting Solution',
  //   icon: 'bill',
  //   children: [
  //     {
  //       title: 'Forfaiting Solution',
  //       path: '/Forfaiting_Solution',
  //       permission: 'AccessLogs'
  //     },
  //   ]
  // },
  // {
  //   id: 'Invoice Factoring',
  //   title: 'Invoice Factoring',
  //   asset_key: 'Invoice Factoring',
  //   icon: 'bill',
  //   children: [
  //     {
  //       title: 'Invoice Factoring',
  //       path: '/Invoice_Factoring',
  //       permission: 'AccessLogs'
  //     },
  //   ]
  // },
  // {
  //   id: 'Murabaha',
  //   title: 'Murabaha',
  //   asset_key: 'Murabaha',
  //   icon: 'bill',
  //   children: [
  //     {
  //       title: 'Murabaha',
  //       path: '/MurabahaApp',
  //       permission: 'AccessLogs'
  //     },
  //   ]
  // },
  {
    id: 'Knowledge_Base_Management',
    title: 'Knowledge Base Management',
    asset_key: 'Knowledge_Base_Management',
    icon: 'bill',
    children: [
      {
        title: 'Trade Knowledge Base',
        path: '/Knowledge_Base_Management',
        permission: { asset: 'Knowledge Base Management', actions: ['load', 'view'] }
      },
    ]
  },


  {
    id: 'MLC Validation',
    title: 'MLC Lifecycle',
    asset_key: 'MLC Validation',
    icon: 'verify',
    path: '/mlc/home',
    permission: { asset: 'MLC_Validation', actions: ['load', 'view'] }
  }


];

export const MENU_MEGA: TMenuConfig = [
  {
    title: 'Home',
    path: '/'
  },
  {
    title: 'Profiles',
    children: [
      {
        title: 'Profiles',
        children: [
          {
            children: [
              {
                title: 'Default',
                icon: 'badge',
                path: '/public-profile/profiles/default'
              },
              {
                title: 'Creator',
                icon: 'coffee',
                path: '/public-profile/profiles/creator'
              },
              {
                title: 'Company',
                icon: 'abstract-41',
                path: '/public-profile/profiles/company'
              },
              {
                title: 'NFT',
                icon: 'bitcoin',
                path: '/public-profile/profiles/nft'
              },
              {
                title: 'Blogger',
                icon: 'message-text',
                path: '/public-profile/profiles/blogger'
              },
              {
                title: 'CRM',
                icon: 'devices',
                path: '/public-profile/profiles/crm'
              },
              {
                title: 'Gamer',
                icon: 'ghost',
                path: '/public-profile/profiles/gamer'
              }
            ]
          },
          {
            children: [
              {
                title: 'Feeds',
                icon: 'book',
                path: '/public-profile/profiles/feeds'
              },
              {
                title: 'Plain',
                icon: 'files',
                path: '/public-profile/profiles/plain'
              },
              {
                title: 'Modal',
                icon: 'mouse-square',
                path: '/public-profile/profiles/modal'
              },
              {
                title: 'Freelancer',
                icon: 'financial-schedule',
                path: '#',
                disabled: true
              },
              {
                title: 'Developer',
                icon: 'technology-4',
                path: '#',
                disabled: true
              },
              {
                title: 'Team',
                icon: 'users',
                path: '#',
                disabled: true
              },
              {
                title: 'Events',
                icon: 'calendar-tick',
                path: '#',
                disabled: true
              }
            ]
          }
        ]
      },
      {
        title: 'Other Pages',
        children: [
          {
            children: [
              {
                title: 'Projects - 3 Columns',
                icon: 'element-6',
                path: '/public-profile/projects/3-columns'
              },
              {
                title: 'Projects - 2 Columns',
                icon: 'element-4',
                path: '/public-profile/projects/2-columns'
              },
              {
                title: 'Works',
                icon: 'office-bag',
                path: '/public-profile/works'
              },
              {
                title: 'Teams',
                icon: 'people',
                path: '/public-profile/teams'
              },
              {
                title: 'Network',
                icon: 'icon',
                path: '/public-profile/network'
              },
              {
                title: 'Activity',
                icon: 'chart-line-up-2',
                path: '/public-profile/activity'
              },
              {
                title: 'Campaigns - Card',
                icon: 'element-11',
                path: '/public-profile/campaigns/card'
              }
            ]
          },
          {
            children: [
              {
                title: 'Campaigns - List',
                icon: 'kanban',
                path: '/public-profile/campaigns/list'
              },
              {
                title: 'Empty',
                icon: 'file-sheet',
                path: '/public-profile/empty'
              },
              {
                title: 'Documents',
                icon: 'document',
                path: '#',
                disabled: true
              },
              {
                title: 'Badges',
                icon: 'award',
                path: '#',
                disabled: true
              },
              {
                title: 'Awards',
                icon: 'gift',
                path: '#',
                disabled: true
              }
            ]
          }
        ]
      }
    ]
  },
  {
    title: 'My Account',
    children: [
      {
        title: 'General Pages',
        children: [
          { title: 'Integrations', icon: 'technology-2', path: '/account/integrations' },
          { title: 'Notifications', icon: 'notification-1', path: '/account/notifications' },
          { title: 'API Keys', icon: 'key', path: '/account/api-keys' },
          { title: 'Appearance', icon: 'eye', path: '/account/appearance' },
          { title: 'Invite a Friend', icon: 'user-tick', path: '/account/invite-a-friend' },
          { title: 'Activity', icon: 'support', path: '/account/activity' },
          { title: 'Brand', icon: 'verify', disabled: true },
          { title: 'Get Paid', icon: 'euro', disabled: true }
        ]
      },
      {
        title: 'Other pages',
        children: [
          {
            title: 'Account Home',
            children: [
              { title: 'Get Started + ', path: '/account/home/get-started' },
              { title: 'User Profile', path: '/account/home/user-profile' },
              { title: 'Company Profile', path: '/account/home/company-profile' },
              { title: 'With Sidebar', path: '/account/home/settings-sidebar' },
              { title: 'Enterprise', path: '/account/home/settings-enterprise' },
              { title: 'Plain', path: '/account/home/settings-plain' },
              { title: 'Modal', path: '/account/home/settings-modal' }
            ]
          },
          {
            title: 'Billing',
            children: [
              { title: 'Basic Billing', path: '/account/billing/basic' },
              { title: 'Enterprise', path: '/account/billing/enterprise' },
              { title: 'Plans', path: '/account/billing/plans' },
              { title: 'Billing History', path: '/account/billing/history' },
              { title: 'Tax Info', disabled: true },
              { title: 'Invoices', disabled: true },
              { title: 'Gateaways', disabled: true }
            ]
          },
          {
            title: 'Security',
            children: [
              { title: 'Get Started', path: '/account/security/get-started' },
              { title: 'Security Overview', path: '/account/security/overview' },
              { title: 'IP Addresses', path: '/account/security/allowed-ip-addresses' },
              { title: 'Privacy Settings', path: '/account/security/privacy-settings' },
              { title: 'Device Management', path: '/account/security/device-management' },
              { title: 'Backup & Recovery', path: '/account/security/backup-and-recovery' },
              { title: 'Current Sessions', path: '/account/security/current-sessions' },
              { title: 'Security Log', path: '/account/security/security-log' }
            ]
          },
          {
            title: 'Members & Roles',
            children: [
              { title: 'Teams Starter', path: '/account/members/team-starter' },
              { title: 'Teams', path: '/account/members/teams' },
              { title: 'Team Info', path: '/account/members/team-info' },
              { title: 'Members Starter', path: '/account/members/members-starter' },
              { title: 'Team Members', path: '/account/members/team-members' },
              { title: 'Import Members', path: '/account/members/import-members' },
              { title: 'Roles', path: '/account/members/roles' },
              { title: 'Permissions - Toggler', path: '/account/members/permissions-toggle' },
              { title: 'Permissions - Check', path: '/account/members/permissions-check' }
            ]
          },
          {
            title: 'Other Pages',
            children: [
              { title: 'Integrations', path: '/account/integrations' },
              { title: 'Notifications', path: '/account/notifications' },
              { title: 'API Keys', path: '/account/api-keys' },
              { title: 'Appearance', path: '/account/appearance' },
              { title: 'Invite a Friend', path: '/account/invite-a-friend' },
              { title: 'Activity', path: '/account/activity' }
            ]
          }
        ]
      }
    ]
  },
  {
    title: 'Network',
    children: [
      {
        title: 'General Pages',
        children: [
          { title: 'Get Started', icon: 'flag', path: '/network/get-started' },
          { title: 'Colleagues', icon: 'users', path: '#', disabled: true },
          { title: 'Donators', icon: 'heart', path: '#', disabled: true },
          { title: 'Leads', icon: 'abstract-21', path: '#', disabled: true }
        ]
      },
      {
        title: 'Other pages',
        children: [
          {
            title: 'User Cards',
            children: [
              { title: 'Mini Cards', path: '/network/user-cards/mini-cards' },
              { title: 'Team Members', path: '/network/user-cards/team-crew' },
              { title: 'Authors', path: '/network/user-cards/author' },
              { title: 'NFT Users', path: '/network/user-cards/nft' },
              { title: 'Social Users', path: '/network/user-cards/social' },
              { title: 'Gamers', path: '#', disabled: true }
            ]
          },
          {
            title: 'User Base',
            badge: 'Datatables',
            children: [
              { title: 'Team Crew', path: '/network/user-table/team-crew' },
              { title: 'App Roster', path: '/network/user-table/app-roster' },
              { title: 'Market Authors', path: '/network/user-table/market-authors' },
              { title: 'SaaS Users', path: '/network/user-table/saas-users' },
              { title: 'Store Clients', path: '/network/user-table/store-clients' },
              { title: 'Visitors', path: '/network/user-table/visitors' }
            ]
          }
        ]
      }
    ]
  },
  {
    title: 'Authentication',
    children: [
      {
        title: 'General pages',
        children: [
          {
            title: 'Classic Layout',
            children: [
              { title: 'Sign In', path: '/auth/classic/login' },
              { title: 'Sign Up', path: '/auth/classic/signup' },
              { title: '2FA', path: '/auth/classic/2fa' },
              { title: 'Check Email', path: '/auth/classic/check-email' },
              {
                title: 'Reset Password',
                children: [
                  {
                    title: 'Enter Email',
                    path: '/auth/classic/reset-password/enter-email'
                  },
                  {
                    title: 'Check Email',
                    path: '/auth/classic/reset-password/check-email'
                  },
                  {
                    title: 'Change Password',
                    path: '/auth/classic/reset-password/change'
                  },
                  {
                    title: 'Password is Changed',
                    path: '/auth/classic/reset-password/changed'
                  }
                ]
              }
            ]
          },
          {
            title: 'Branded Layout',
            children: [
              { title: 'Sign In', path: '/auth/login' },
              { title: 'Sign Up', path: '/auth/signup' },
              { title: '2FA', path: '/auth/2fa' },
              { title: 'Check Email', path: '/auth/check-email' },
              {
                title: 'Reset Password',
                children: [
                  {
                    title: 'Enter Email',
                    path: '/auth/reset-password/enter-email'
                  },
                  {
                    title: 'Check Email',
                    path: '/auth/reset-password/check-email'
                  },
                  {
                    title: 'Change Password',
                    path: '/auth/reset-password/change'
                  },
                  {
                    title: 'Password is Changed',
                    path: '/auth/reset-password/changed'
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        title: 'Other Pages',
        children: [
          { title: 'Welcome Message', icon: 'like-2', path: '/auth/welcome-message' },
          {
            title: 'Account Deactivated',
            icon: 'shield-cross',
            path: '/auth/account-deactivated'
          },
          { title: 'Error 404', icon: 'message-question', path: '/error/404' },
          { title: 'Error 500', icon: 'information', path: '/error/500' }
        ]
      }
    ]
  },
  {
    title: 'Help',
    children: [
      {
        title: 'Getting Started',
        icon: 'coffee',
        path: 'https://keenthemes.com/metronic/tailwind/docs/getting-started/installation'
      },
      {
        title: 'Support Forum',
        icon: 'information',
        children: [
          {
            title: 'All Questions',
            icon: 'questionnaire-tablet',
            path: 'https://devs.keenthemes.com'
          },
          {
            title: 'Popular Questions',
            icon: 'star',
            path: 'https://devs.keenthemes.com/popular'
          },
          {
            title: 'Ask Question',
            icon: 'message-question',
            path: 'https://devs.keenthemes.com/question/create'
          }
        ]
      },
      {
        title: 'Licenses & FAQ',
        tooltip: {
          title: 'Learn more about licenses',
          placement: 'right'
        },
        icon: 'subtitle',
        path: 'https://keenthemes.com/metronic/tailwind/docs/getting-started/license'
      },
      {
        title: 'Documentation',
        icon: 'questionnaire-tablet',
        path: 'https://keenthemes.com/metronic/tailwind/docs'
      },
      { separator: true },
      {
        title: 'Contact Us',
        icon: 'share',
        path: 'https://keenthemes.com/contact'
      }
    ]
  }
];

export const MENU_ROOT: TMenuConfig = [
  {
    title: 'Public Profile',
    icon: 'profile-circle',
    rootPath: '/public-profile/',
    path: 'public-profile/profiles/default',
    childrenIndex: 2
  },
  {
    title: 'Account',
    icon: 'setting-2',
    rootPath: '/account/',
    path: '/',
    childrenIndex: 3
  },
  {
    title: 'Network',
    icon: 'users',
    rootPath: '/network/',
    path: 'network/get-started',
    childrenIndex: 4
  },
  {
    title: 'Authentication',
    icon: 'security-user',
    rootPath: '/authentication/',
    path: 'authentication/get-started',
    childrenIndex: 5
  }
];
