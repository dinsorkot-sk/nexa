import sys, json, os, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import figlib
from figlib import *
d = new_doc()
import tokens, icons, writer
import comp_base as CB
from comp_base import *

SC = '/tmp/claude-1000/-mnt-d-project-nexa/b0d457a6-5113-4dd2-b411-a0ee44a1940e/scratchpad'
SRC_COPY = '/mnt/d/project/nexa/mockup/nexa - Copy.figcraft'
tokens.build_tokens()
import zipfile
doc_copy = SC + '/b_copy/document.json'
icons.import_icons(doc_copy)
import preview
preview.build_icon_map(icons.ICON_MASTERS)

import comp_more as MR, comp_fields as FL, comp_composite as CC, comp_extra as EX, comp_actions as A, comp_display as D, comp_forms as F, comp_nav as NV, found

SETS = {}
def add(key, s):
    SETS[key] = s
    return s

# order matters: instances need their parts built first
add('Button', A.button_set()); add('IconButton', A.icon_button_set())
add('Badge', D.badge_set()); add('Indicator', D.indicator_set()); add('Chip', D.chip_set()); add('Avatar', D.avatar_set())
add('Kbd', D.kbd_set()); add('Logo', D.logo_set()); add('Card', D.card_set()); add('Alert', D.alert_set())
add('Input', F.input_set()); add('Textarea', F.textarea_set()); add('Select', F.select_set())
add('Checkbox', F.checkbox_set()); add('Radio', F.radio_set()); add('Switch', F.switch_set()); add('FormField', F.formfield_set())
add('Toast', D.toast_set()); add('Tooltip', D.tooltip_set()); add('Separator', D.separator_set()); add('Skeleton', D.skeleton_set())
add('Tab', NV.tab_set()); add('Tabs', NV.tabs_set()); add('Segment', NV.segment_set()); add('Segmented', NV.segmented_set())
add('NavItem', NV.navitem_set()); add('NavGroupLabel', NV.navgroup_set()); add('BreadcrumbItem', NV.crumb_set()); add('Breadcrumb', NV.breadcrumb_set())
add('PageButton', NV.page_set()); add('Pagination', NV.pagination_set()); add('MenuItem', NV.menuitem_set()); add('Menu', NV.menu_set())
add('Modal', NV.modal_set()); add('EmptyState', NV.empty_set())
add('TableRow', CC.tablerow_set()); add('Table', CC.table_set()); add('StatCard', CC.stat_set()); add('Progress', CC.progress_set())
add('Step', CC.step_set()); add('Stepper', CC.stepper_set()); add('KanbanCard', CC.kanban_set()); add('FileUpload', CC.upload_set())
add('CommandPalette', CC.palette_set()); add('Slideover', CC.slideover_set()); add('OrgSwitcher', CC.orgswitcher_set())
add('Sidebar', CC.sidebar_set()); add('Navbar', CC.navbar_set()); add('PageHeader', CC.pageheader_set())
add('DayCell', EX.day_set()); add('Calendar', EX.calendar_set()); add('DatePicker', EX.datepicker_set())
add('CalendarEvent', EX.event_set()); add('CalendarDay', EX.dayblock_set()); add('CalendarView', EX.calview_set())
add('BarChart', EX.bar_set()); add('ChartLegend', EX.legend_set()); add('ChartCard', EX.chartcard_set())
add('SelectMenuTrigger', EX.smtrigger_set()); add('SelectMenu', EX.selectmenu_set())
add('FieldInput', FL.fieldinput_set()); add('FieldValue', FL.fieldvalue_set())
for k, fn in [('Banner', MR.banner_set), ('ActivityItem', MR.activity_set), ('Timeline', MR.timeline_set), ('AccordionItem', MR.accitem_set), ('Accordion', MR.accordion_set),
              ('Popover', MR.popover_set), ('AvatarGroup', MR.avgroup_set), ('Link', MR.link_set), ('CodeBlock', MR.code_set), ('LineChart', MR.line_set), ('DonutChart', MR.donut_set),
              ('FieldRow', MR.fieldrow_set), ('FormulaEditor', MR.formula_set), ('WorkflowNode', MR.wfnode_set), ('WorkflowEdge', MR.wfedge_set), ('PermissionCell', MR.permcell_set),
              ('PermissionsTable', MR.permtable_set), ('DiffRow', MR.diffrow_set), ('PackageDiff', MR.pkgdiff_set), ('ReferenceSelect', MR.refselect_set)]:
    add(k, fn())
print('sets', len(SETS), 'variants', sum(len(s.children) for s in SETS.values()))

if __name__ == '__main__':
    pass
