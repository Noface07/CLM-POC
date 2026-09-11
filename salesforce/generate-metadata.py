import os, io, json

ROOT = "salesforce"
APP = os.path.join(ROOT, "force-app", "main", "default")

HDR = '<?xml version="1.0" encoding="UTF-8"?>\n'
NS = 'xmlns="http://soap.sforce.com/2006/04/metadata"'


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, "w", encoding="utf-8", newline="\n").write(text.rstrip() + "\n")


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def f_text(api, label, length, external=False, unique=False):
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <externalId>" + str(external).lower() + "</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <length>" + str(length) + "</length>\n"
            "    <required>false</required>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Text</type>\n"
            "    <unique>" + str(unique).lower() + "</unique>\n"
            "</CustomField>", "Edit")


def f_checkbox(api, label):
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <defaultValue>false</defaultValue>\n"
            "    <externalId>false</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Checkbox</type>\n"
            "</CustomField>", "Edit")


def f_picklist(api, label, values):
    items = "\n".join(
        "                <value>\n"
        "                    <fullName>" + esc(v) + "</fullName>\n"
        "                    <default>false</default>\n"
        "                    <label>" + esc(v) + "</label>\n"
        "                </value>" for v in values)
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <externalId>false</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <required>false</required>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Picklist</type>\n"
            "    <valueSet>\n"
            "        <restricted>true</restricted>\n"
            "        <valueSetDefinition>\n"
            "            <sorted>false</sorted>\n"
            + items + "\n"
            "        </valueSetDefinition>\n"
            "    </valueSet>\n"
            "</CustomField>", "Edit")


def f_currency(api, label):
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <externalId>false</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <precision>16</precision>\n"
            "    <required>false</required>\n"
            "    <scale>2</scale>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Currency</type>\n"
            "</CustomField>", "Edit")


def f_date(api, label, kind="Date"):
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <externalId>false</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <required>false</required>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>" + kind + "</type>\n"
            "</CustomField>", "Edit")


def f_url(api, label):
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <externalId>false</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <required>false</required>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Url</type>\n"
            "</CustomField>", "Edit")


def f_lookup(api, label, target, rel_name, rel_label, required=False):
    # A required lookup cannot be SetNull -- Salesforce rejects the combination,
    # because nulling the field would leave the record invalid. Restrict blocks
    # deleting a supplier that still has an onboarding record hanging off it.
    constraint = "Restrict" if required else "SetNull"
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <deleteConstraint>" + constraint + "</deleteConstraint>\n"
            "    <externalId>false</externalId>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <referenceTo>" + target + "</referenceTo>\n"
            "    <relationshipLabel>" + esc(rel_label) + "</relationshipLabel>\n"
            "    <relationshipName>" + rel_name + "</relationshipName>\n"
            "    <required>" + str(required).lower() + "</required>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Lookup</type>\n"
            "</CustomField>", "Required" if required else "Edit")


def f_formula(api, label, formula):
    return (api, HDR + "<CustomField " + NS + ">\n"
            "    <fullName>" + api + "</fullName>\n"
            "    <externalId>false</externalId>\n"
            "    <formula>" + esc(formula) + "</formula>\n"
            "    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <required>false</required>\n"
            "    <trackTrending>false</trackTrending>\n"
            "    <type>Text</type>\n"
            "    <unique>false</unique>\n"
            "</CustomField>", "Readonly")


def custom_object(api, label, plural, auto_format, auto_label, desc):
    return (HDR + "<CustomObject " + NS + ">\n"
            "    <allowInChatterGroups>false</allowInChatterGroups>\n"
            "    <compactLayoutAssignment>SYSTEM</compactLayoutAssignment>\n"
            "    <deploymentStatus>Deployed</deploymentStatus>\n"
            "    <description>" + esc(desc) + "</description>\n"
            "    <enableActivities>false</enableActivities>\n"
            "    <enableBulkApi>true</enableBulkApi>\n"
            "    <enableFeeds>false</enableFeeds>\n"
            "    <enableHistory>false</enableHistory>\n"
            "    <enableLicensing>false</enableLicensing>\n"
            "    <enableReports>true</enableReports>\n"
            "    <enableSearch>true</enableSearch>\n"
            "    <enableSharing>true</enableSharing>\n"
            "    <enableStreamingApi>true</enableStreamingApi>\n"
            "    <label>" + esc(label) + "</label>\n"
            "    <nameField>\n"
            "        <displayFormat>" + auto_format + "</displayFormat>\n"
            "        <label>" + esc(auto_label) + "</label>\n"
            "        <type>AutoNumber</type>\n"
            "    </nameField>\n"
            "    <pluralLabel>" + esc(plural) + "</pluralLabel>\n"
            "    <searchLayouts/>\n"
            "    <sharingModel>ReadWrite</sharingModel>\n"
            "    <visibility>Public</visibility>\n"
            "</CustomObject>")


def layout(label, entries):
    items = "\n".join(
        "            <layoutItems>\n"
        "                <behavior>" + beh + "</behavior>\n"
        "                <field>" + api + "</field>\n"
        "            </layoutItems>" for api, beh in entries)
    return (HDR + "<Layout " + NS + ">\n"
            "    <layoutSections>\n"
            "        <customLabel>true</customLabel>\n"
            "        <detailHeading>false</detailHeading>\n"
            "        <editHeading>true</editHeading>\n"
            "        <label>" + esc(label) + "</label>\n"
            "        <layoutColumns>\n"
            + items + "\n"
            "        </layoutColumns>\n"
            "        <layoutColumns/>\n"
            "        <style>TwoColumnsTopToBottom</style>\n"
            "    </layoutSections>\n"
            "    <showEmailCheckbox>false</showEmailCheckbox>\n"
            "    <showHighlightsPanel>false</showHighlightsPanel>\n"
            "    <showInteractionLogPanel>false</showInteractionLogPanel>\n"
            "    <showRunAssignmentRulesCheckbox>false</showRunAssignmentRulesCheckbox>\n"
            "    <showSubmitAndAttachButton>false</showSubmitAndAttachButton>\n"
            "</Layout>")


def list_view(label, columns):
    # A freshly created object has only "Recently Viewed", which is empty until you have
    # opened a record -- so a correctly seeded object looks like a failed one. filterScope
    # Everything is the "All" view that should have been there from the start.
    cols = "\n".join("    <columns>" + c + "</columns>" for c in columns)
    return (HDR + "<ListView " + NS + ">\n"
            "    <fullName>All</fullName>\n"
            + cols + "\n"
            "    <filterScope>Everything</filterScope>\n"
            "    <label>" + esc(label) + "</label>\n"
            "</ListView>")


def tab(motif):
    return (HDR + "<CustomTab " + NS + ">\n"
            "    <customObject>true</customObject>\n"
            "    <motif>" + motif + "</motif>\n"
            "</CustomTab>")


WORKSPACE_URL = "http://localhost:5173"
FORMULA = (
    'IF(\n'
    '  AND(\n'
    '    ISPICKVAL(Onboarding_Status__c, "Approved - Ready to Contract"),\n'
    '    Qualification_Complete__c,\n'
    '    Insurance_Verified__c,\n'
    '    Bank_Verified__c,\n'
    '    Sanctions_Cleared__c\n'
    '  ),\n'
    '  HYPERLINK("' + WORKSPACE_URL + '/#sf?onb=" & Id & "&acct=" & Account__c, "Create Contract", "_blank"),\n'
    '  "Onboarding incomplete"\n'
    ')'
)

onb_fields = [
    f_lookup("Account__c", "Account", "Account", "Supplier_Onboarding", "Supplier Onboarding", required=True),
    f_picklist("Onboarding_Status__c", "Onboarding Status",
               ["Approved - Ready to Contract", "Insurance Pending", "In Qualification", "Rejected"]),
    f_checkbox("Qualification_Complete__c", "Qualification Complete"),
    f_checkbox("Insurance_Verified__c", "Insurance Verified"),
    f_checkbox("Bank_Verified__c", "Bank Verified"),
    f_checkbox("Sanctions_Cleared__c", "Sanctions Cleared"),
    f_picklist("Supplier_Category__c", "Supplier Category",
               ["Facilities Services", "Hard Services", "Soft Services"]),
    f_picklist("Service_Category__c", "Service Category",
               ["Hard FM", "Soft FM", "Integrated FM", "Cleaning", "Technical Maintenance",
                "Engineering", "Grounds/Landscaping", "Waste Management", "Energy Management", "Other"]),
    f_text("Facility_Site__c", "Facility / Site", 120),
    f_text("Legal_Entity__c", "Legal Entity (ours)", 120),
    f_text("Business_Unit__c", "Business Unit", 80),
    f_text("Business_Owner__c", "Business Owner", 80),
    f_text("Procurement_Owner__c", "Procurement Owner", 80),
    f_text("Company_Number__c", "Company Number", 20),
    f_text("Primary_Contact__c", "Primary Contact", 120),
    f_currency("Contract_Value__c", "Anticipated Contract Value"),
    f_text("Payment_Terms__c", "Payment Terms", 40),
    f_text("CLM_Contract_Id__c", "CLM Contract Id", 40),
    f_text("CLM_Contract_Status__c", "CLM Contract Status", 60),
    f_formula("CLM_Workspace_URL__c", "Create Contract", FORMULA),
]

CONTRACT_STATUS = ["Draft", "Internal Review", "In Negotiation", "Exception Review", "Approved",
                   "Ready for Signature", "Signature Pending", "Executed", "Active",
                   "Amendment in Progress", "Renewal in Progress", "Expiring", "Expired",
                   "Termination in Progress", "Terminated", "Cancelled"]
APPROVAL_STATUS = ["Not Started", "In Progress", "Approved", "Rejected",
                   "Changes Requested", "Exception Approval Required"]
SIGNATURE_STATUS = ["Not Ready", "Pending", "Partially Signed", "Executed",
                    "Declined", "Expired", "Cancelled"]

con_fields = [
    f_lookup("Supplier__c", "Supplier", "Account", "CLM_Contracts", "CLM Contracts"),
    f_lookup("Onboarding__c", "Onboarding", "Supplier_Onboarding__c", "CLM_Contracts", "CLM Contracts"),
    f_text("Contract_Reference__c", "Contract Reference", 40, external=True, unique=True),
    f_text("Agreement_Type__c", "Agreement Type", 80),
    f_text("Contract_Template__c", "Contract Template", 80),
    f_text("Template_Version__c", "Template Version", 20),
    f_picklist("Contract_Status__c", "Contract Status", CONTRACT_STATUS),
    f_picklist("Approval_Status__c", "Approval Status", APPROVAL_STATUS),
    f_picklist("Signature_Status__c", "Signature Status", SIGNATURE_STATUS),
    f_text("Current_Version__c", "Current Version", 20),
    f_currency("Contract_Value__c", "Contract Value"),
    f_text("Currency_Code__c", "Currency Code", 3),
    f_date("Start_Date__c", "Start Date"),
    f_date("End_Date__c", "End Date"),
    f_checkbox("Evergreen__c", "Evergreen"),
    f_date("Effective_Date__c", "Effective Date"),
    f_checkbox("PO_Eligibility__c", "PO Eligibility"),
    f_url("Executed_Document_URL__c", "Executed Document URL"),
    f_text("Last_Milestone__c", "Last Milestone", 255),
    f_date("Last_Sync__c", "Last Sync", kind="DateTime"),
]

LIST_COLUMNS = {
    "Supplier_Onboarding__c": ["NAME", "Account__c", "Onboarding_Status__c",
                              "Service_Category__c", "Contract_Value__c",
                              "CLM_Contract_Id__c", "CLM_Contract_Status__c"],
    "CLM_Contract__c": ["NAME", "Contract_Reference__c", "Supplier__c",
                        "Contract_Status__c", "Current_Version__c",
                        "PO_Eligibility__c", "Last_Sync__c"],
}

specs = [
    ("Supplier_Onboarding__c", "Supplier Onboarding", "Supplier Onboarding",
     "ONB-{YYYY}-{0000}", "Onboarding Number",
     "One supplier qualification journey. Carries the prerequisites that gate contract "
     "initiation, and the Create Contract link into the CLM.",
     onb_fields, "Custom19: Handsaw"),
    ("CLM_Contract__c", "CLM Contract", "CLM Contracts",
     "CLM-{0000}", "Contract Record Number",
     "The contract lifecycle as the CLM reports it back: status, version, signature and PO eligibility.",
     con_fields, "Custom20: Airplane"),
]

for api, label, plural, fmt, auto_label, desc, fields, motif in specs:
    base = os.path.join(APP, "objects", api)
    w(os.path.join(base, api + ".object-meta.xml"),
      custom_object(api, label, plural, fmt, auto_label, desc))
    for fapi, xml, _beh in fields:
        w(os.path.join(base, "fields", fapi + ".field-meta.xml"), xml)
    w(os.path.join(APP, "layouts", api + "-" + label + " Layout.layout-meta.xml"),
      layout("Information", [(fapi, beh) for fapi, _x, beh in fields]))
    w(os.path.join(APP, "tabs", api + ".tab-meta.xml"), tab(motif))
    w(os.path.join(base, "listViews", "All.listView-meta.xml"),
      list_view("All", LIST_COLUMNS[api]))

perms = []
for api, label, plural, fmt, auto_label, desc, fields, motif in specs:
    for fapi, _x, beh in fields:
        # A required field carries no field-level security: Salesforce grants it to
        # everyone who can see the object, because a field you must fill in is not one
        # anybody can be denied. Listing it here is rejected outright with
        # "You cannot deploy to a required field".
        if beh == "Required":
            continue
        editable = "false" if beh == "Readonly" else "true"
        perms.append("    <fieldPermissions>\n"
                     "        <editable>" + editable + "</editable>\n"
                     "        <field>" + api + "." + fapi + "</field>\n"
                     "        <readable>true</readable>\n"
                     "    </fieldPermissions>")

objperms = "\n".join(
    "    <objectPermissions>\n"
    "        <allowCreate>true</allowCreate>\n"
    "        <allowDelete>true</allowDelete>\n"
    "        <allowEdit>true</allowEdit>\n"
    "        <allowRead>true</allowRead>\n"
    "        <modifyAllRecords>true</modifyAllRecords>\n"
    "        <object>" + s[0] + "</object>\n"
    "        <viewAllRecords>true</viewAllRecords>\n"
    "    </objectPermissions>" for s in specs)

tabsets = "\n".join(
    "    <tabSettings>\n"
    "        <tab>" + s[0] + "</tab>\n"
    "        <visibility>Visible</visibility>\n"
    "    </tabSettings>" for s in specs)

w(os.path.join(APP, "permissionsets", "CLM_Integration.permissionset-meta.xml"),
  HDR + "<PermissionSet " + NS + ">\n"
  # Element order follows the schema, and a PermissionSet's application visibility takes
  # only application + visible. The <default> element belongs to the Profile variant of
  # this type; including it here fails the parse rather than being ignored.
  "    <applicationVisibilities>\n"
  "        <application>FM_Contracting</application>\n"
  "        <visible>true</visible>\n"
  "    </applicationVisibilities>\n"
  "    <description>Read/write on the CLM integration objects and every field the CLM "
  "reads or writes. Assign this to yourself after deploying.</description>\n"
  "    <hasActivationRequired>false</hasActivationRequired>\n"
  "    <label>CLM Integration</label>\n"
  + "\n".join(sorted(perms)) + "\n"
  + objperms + "\n"
  + tabsets + "\n"
  "</PermissionSet>")

# A dedicated app, rather than bolting the tabs onto Sales.
#
# Editing the standard Sales app through metadata means shipping a full copy of its
# navigation and hoping nothing else in the org depended on the original. A purpose-built
# app is additive, cannot break anything that already works, and demos better: the person
# watching sees a contracting workspace rather than a CRM with two extra tabs.
APP_LINES = [
    HDR.strip(),
    "<CustomApplication " + NS + ">",
    "    <description>Supplier onboarding through to executed contract, for the FM CLM proof of concept.</description>",
    "    <formFactors>Large</formFactors>",
    "    <isNavAutoTempTabsDisabled>false</isNavAutoTempTabsDisabled>",
    "    <isNavPersonalizationDisabled>false</isNavPersonalizationDisabled>",
    "    <label>FM Contracting</label>",
    "    <navType>Standard</navType>",
    "    <tabs>standard-home</tabs>",
    "    <tabs>standard-Account</tabs>",
    "    <tabs>Supplier_Onboarding__c</tabs>",
    "    <tabs>CLM_Contract__c</tabs>",
    "    <uiType>Lightning</uiType>",
    "</CustomApplication>",
]
w(os.path.join(APP, "applications", "FM_Contracting.app-meta.xml"), chr(10).join(APP_LINES))

w(os.path.join(ROOT, "sfdx-project.json"), json.dumps({
    "packageDirectories": [{"path": "force-app", "default": True}],
    "name": "clm-salesforce",
    "namespace": "",
    "sfdcLoginUrl": "https://login.salesforce.com",
    "sourceApiVersion": "62.0",
}, indent=2))

print("generated " + str(sum(len(s[6]) for s in specs)) + " fields across " + str(len(specs)) + " objects")
