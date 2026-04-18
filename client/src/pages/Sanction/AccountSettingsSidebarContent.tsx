import { Tab, TabPanel, Tabs, TabsList } from '@/components/tabs';
import Sanction from './SanctionComponents/Sanction';
import ManualEntry from './SanctionComponents/ManualEntry';
import RetrivePastScreening from './SanctionComponents/RetrivePastScreening';
import { Container } from '@/components';

const AccountSettingsSidebarContent = () => {
  return (
    <div className="w-full p-6 space-y-6 card ">
      {/* <Container> */}
        <Tabs defaultValue="sanction">
          <TabsList className="mb-5 flex flex-wrap items-center gap-3 border-b border-gray-200 px-2 pb-3">
            <Tab value="sanction" className="text-md">
              Sanction
            </Tab>
            <Tab value="manual-entry" className="text-md">
              Manual Entry
            </Tab>
            <Tab value="retrieve-screening" className="text-md">
              Retrieve Past Screening
            </Tab>
          </TabsList>

          <TabPanel value="sanction">
            <div id="Sanction">
              <Sanction />
            </div>
          </TabPanel>

          <TabPanel value="manual-entry">
            <div id="ManualEntry">
              <ManualEntry />
            </div>
          </TabPanel>

          <TabPanel value="retrieve-screening">
            <div id="RetrivePastScreening">
              <RetrivePastScreening />
            </div>
          </TabPanel>
        </Tabs>
      {/* </Container> */}
    </div>
  );
};

// export { AccountSettingsSidebarContent };
export default AccountSettingsSidebarContent;
