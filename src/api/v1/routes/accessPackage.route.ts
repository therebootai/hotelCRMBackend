import { Router, Request, Response, NextFunction } from "express";
import {
  createAccessPackage,
  getAllAccessPackages,
  getAccessPackageById,
  updateAccessPackage,
  deleteAccessPackage,
} from "@/api/v1/controllers/accessPackage.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createAccessPackageSchema,
  updateAccessPackageSchema,
  getAllAccessPackagesSchema,
  getAccessPackageByIdSchema,
  deleteAccessPackageSchema,
} from "@/api/v1/validations/accessPackage.validation";

const router = Router();

// Middleware to parse multipart/form-data fields properly before Zod validation
const parseAccessPackageBody = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body.payload === "string") {
    try {
      req.body = JSON.parse(req.body.payload);
    } catch (err) {
      // Ignored: body will remain as is
    }
  } else if (req.body) {
    // Coerce numeric fields
    if (typeof req.body.adult_price === "string") {
      req.body.adult_price = Number(req.body.adult_price);
    }
    if (typeof req.body.child_price === "string") {
      req.body.child_price = Number(req.body.child_price);
    }
    // Coerce boolean fields
    if (req.body.isActive === "true") req.body.isActive = true;
    if (req.body.isActive === "false") req.body.isActive = false;

    // Coerce inclusions array
    if (typeof req.body.inclusions === "string") {
      try {
        req.body.inclusions = JSON.parse(req.body.inclusions);
      } catch (e) {
        req.body.inclusions = req.body.inclusions.split(",").map((s: string) => s.trim());
      }
    }
    // Coerce add_ons array
    if (typeof req.body.add_ons === "string") {
      try {
        req.body.add_ons = JSON.parse(req.body.add_ons);
      } catch (e) {
        req.body.add_ons = req.body.add_ons.split(",").map((s: string) => s.trim());
      }
    }
  }
  next();
};

router.use(protect);

router.post("/", parseAccessPackageBody, validateRequest(createAccessPackageSchema), createAccessPackage);
router.get("/", validateRequest(getAllAccessPackagesSchema), getAllAccessPackages);
router.get("/:id", validateRequest(getAccessPackageByIdSchema), getAccessPackageById);
router.put("/:id", parseAccessPackageBody, validateRequest(updateAccessPackageSchema), updateAccessPackage);
router.delete("/:id", validateRequest(deleteAccessPackageSchema), deleteAccessPackage);

export default router;
