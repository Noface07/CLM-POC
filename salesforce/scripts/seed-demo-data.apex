// Seed the demo org with the three suppliers the CLM already knows about.
//
// These mirror SIM_ORG in src/lib/salesforce.js exactly, so switching the CLM
// between simulated and live mode shows the same three suppliers either way --
// which is what makes "this is really talking to Salesforce" demonstrable rather
// than asserted.
//
// Safe to run more than once: it clears its own records first and nothing else.
//
//   sf apex run --file salesforce/scripts/seed-demo-data.apex --target-org clmdemo

List<String> demoNames = new List<String>{
    'Meridian Cleaning & Technical Services Ltd.',
    'Ferrow Pest Control',
    'Calder Mechanical & Electrical Ltd.'
};

// Children first: Account__c is a required lookup with Restrict, so a supplier
// with an onboarding record still attached cannot be deleted.
delete [SELECT Id FROM CLM_Contract__c WHERE Supplier__r.Name IN :demoNames];
delete [SELECT Id FROM Supplier_Onboarding__c WHERE Account__r.Name IN :demoNames];
delete [SELECT Id FROM Account WHERE Name IN :demoNames];

Account meridian = new Account(
    Name          = 'Meridian Cleaning & Technical Services Ltd.',
    BillingStreet = 'Unit 4, Fairfax Industrial Park, Reading RG2 0TD',
    BillingCity   = 'Reading',
    BillingCountry= 'United Kingdom'
);
Account ferrow = new Account(
    Name          = 'Ferrow Pest Control',
    BillingStreet = '12 Bell Lane, Slough SL1 2QP',
    BillingCity   = 'Slough',
    BillingCountry= 'United Kingdom'
);
Account calder = new Account(
    Name          = 'Calder Mechanical & Electrical Ltd.',
    BillingStreet = 'Calder Works, Wakefield WF2 7AS',
    BillingCity   = 'Wakefield',
    BillingCountry= 'United Kingdom'
);
insert new List<Account>{ meridian, ferrow, calder };

// 1. Ready to contract. Every prerequisite met, so Create Contract appears.
Supplier_Onboarding__c onbMeridian = new Supplier_Onboarding__c(
    Account__c              = meridian.Id,
    Onboarding_Status__c    = 'Approved - Ready to Contract',
    Qualification_Complete__c = true,
    Insurance_Verified__c     = true,
    Bank_Verified__c          = true,
    Sanctions_Cleared__c      = true,
    Supplier_Category__c    = 'Facilities Services',
    Service_Category__c     = 'Integrated FM',
    Facility_Site__c        = 'Riverside Corporate Campus - Building C',
    Legal_Entity__c         = 'Meridian FM Services (UK) Ltd',
    Business_Unit__c        = 'Corporate Real Estate',
    Business_Owner__c       = 'R. Ashworth',
    Procurement_Owner__c    = 'D. Whitfield',
    Company_Number__c       = '08841221',
    Primary_Contact__c      = 'Kavita Bhatt, Account Director',
    Contract_Value__c       = 486000,
    Payment_Terms__c        = '45 days from invoice'
);

// 2. Blocked. Insurance and sanctions screening outstanding, so the formula
//    field renders "Onboarding incomplete" instead of a link -- this is the
//    record that proves the gate is real.
Supplier_Onboarding__c onbFerrow = new Supplier_Onboarding__c(
    Account__c              = ferrow.Id,
    Onboarding_Status__c    = 'Insurance Pending',
    Qualification_Complete__c = true,
    Insurance_Verified__c     = false,
    Bank_Verified__c          = true,
    Sanctions_Cleared__c      = false,
    Supplier_Category__c    = 'Facilities Services',
    Service_Category__c     = 'Other',
    Facility_Site__c        = 'Riverside Corporate Campus - Building C',
    Legal_Entity__c         = 'Meridian FM Services (UK) Ltd',
    Business_Unit__c        = 'Corporate Real Estate',
    Business_Owner__c       = 'R. Ashworth',
    Procurement_Owner__c    = 'D. Whitfield',
    Company_Number__c       = '09102338',
    Primary_Contact__c      = 'J. Ferrow',
    Contract_Value__c       = 64000,
    Payment_Terms__c        = '30 days from invoice'
);

// 3. Ready, and over every approval threshold in the matrix -- useful for
//    demonstrating escalation rather than plain approval.
Supplier_Onboarding__c onbCalder = new Supplier_Onboarding__c(
    Account__c              = calder.Id,
    Onboarding_Status__c    = 'Approved - Ready to Contract',
    Qualification_Complete__c = true,
    Insurance_Verified__c     = true,
    Bank_Verified__c          = true,
    Sanctions_Cleared__c      = true,
    Supplier_Category__c    = 'Hard Services',
    Service_Category__c     = 'Technical Maintenance',
    Facility_Site__c        = 'Northgate Distribution Park',
    Legal_Entity__c         = 'Meridian FM Services (UK) Ltd',
    Business_Unit__c        = 'Industrial & Logistics',
    Business_Owner__c       = 'P. Mensah',
    Procurement_Owner__c    = 'D. Whitfield',
    Company_Number__c       = '07733114',
    Primary_Contact__c      = 'H. Vance, Commercial Manager',
    Contract_Value__c       = 1240000,
    Payment_Terms__c        = '60 days from invoice'
);

insert new List<Supplier_Onboarding__c>{ onbMeridian, onbFerrow, onbCalder };

for (Supplier_Onboarding__c o : [
        SELECT Name, Account__r.Name, Onboarding_Status__c, CLM_Workspace_URL__c
        FROM Supplier_Onboarding__c
        WHERE Id IN :new List<Id>{ onbMeridian.Id, onbFerrow.Id, onbCalder.Id }
        ORDER BY Account__r.Name ]) {
    System.debug(o.Name + '  ' + o.Account__r.Name + '  [' + o.Onboarding_Status__c + ']');
}
System.debug('Seeded 3 accounts and 3 onboarding records.');
